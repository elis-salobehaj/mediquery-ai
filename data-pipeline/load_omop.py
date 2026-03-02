import polars as pl
from config import settings
import psycopg
import time
from io import BytesIO


def dict_to_pg_copy(conn, df: pl.DataFrame, table_name: str, schema: str):
    """Bulk insert Polars DataFrame to PostgreSQL via COPY using a CSV buffer."""
    print(f"Loading {len(df)} rows into {schema}.{table_name}...")

    columns = ", ".join([f'"{c}"' for c in df.columns])
    copy_query = f"COPY {schema}.{table_name} ({columns}) FROM STDIN WITH (FORMAT CSV, HEADER TRUE)"

    # Write Polars DF to CSV in memory
    buf = BytesIO()
    df.write_csv(buf)
    buf.seek(0)

    try:
        with conn.cursor() as cur:
            with cur.copy(copy_query) as copy:
                copy.write(buf.read())
        conn.commit()
    except Exception as e:
        print(f"Error loading {table_name}: {e}")
        conn.rollback()


def map_patients(patients: pl.DataFrame):
    # Create person_id sequentially and capture Id
    person = patients.with_row_index("person_id", offset=1)

    person = person.with_columns(
        [pl.col("BIRTHDATE").str.to_date("%Y-%m-%d").alias("birth_date_parsed")]
    ).with_columns(
        [
            pl.col("birth_date_parsed").dt.year().alias("year_of_birth"),
            pl.col("birth_date_parsed").dt.month().alias("month_of_birth"),
            pl.col("birth_date_parsed").dt.day().alias("day_of_birth"),
        ]
    )

    # Map Gender
    person = person.with_columns(
        pl.when(pl.col("GENDER") == "M")
        .then(8507)
        .when(pl.col("GENDER") == "F")
        .then(8532)
        .otherwise(0)
        .alias("gender_concept_id")
    )

    # Map Race
    person = person.with_columns(
        pl.when(pl.col("RACE") == "white")
        .then(8527)
        .when(pl.col("RACE") == "black")
        .then(8516)
        .when(pl.col("RACE") == "asian")
        .then(8515)
        .when(pl.col("RACE") == "native")
        .then(8657)
        .otherwise(0)
        .alias("race_concept_id")
    )

    person = person.with_columns(
        pl.when(pl.col("ETHNICITY") == "hispanic")
        .then(38003563)
        .otherwise(38003564)
        .alias("ethnicity_concept_id")
    )

    person_omop = person.select(
        [
            pl.col("person_id"),
            pl.col("gender_concept_id"),
            pl.col("year_of_birth"),
            pl.col("month_of_birth"),
            pl.col("day_of_birth"),
            pl.col("birth_date_parsed").alias("birth_datetime"),
            pl.col("race_concept_id"),
            pl.col("ethnicity_concept_id"),
            pl.lit(0).alias("location_id"),
            pl.lit(0).alias("provider_id"),
            pl.lit(0).alias("care_site_id"),
            pl.col("Id").alias("person_source_value"),
            pl.col("GENDER").alias("gender_source_value"),
            pl.lit(0).alias("gender_source_concept_id"),
            pl.col("RACE").alias("race_source_value"),
            pl.lit(0).alias("race_source_concept_id"),
            pl.col("ETHNICITY").alias("ethnicity_source_value"),
            pl.lit(0).alias("ethnicity_source_concept_id"),
        ]
    )

    id_map = person.select(["Id", "person_id"])
    return person_omop, id_map


def generate_vocabulary(df_list):
    """Extract standard unique concepts from Synthea conditions/medications/procedures"""
    concept_codes = pl.DataFrame(
        {"code": [], "desc": [], "domain": []},
        schema={"code": pl.Utf8, "desc": pl.Utf8, "domain": pl.Utf8},
    )
    for frame, code_col, desc_col, domain in df_list:
        if code_col in frame.columns and desc_col in frame.columns:
            subset = frame.select(
                [
                    pl.col(code_col).alias("code"),
                    pl.col(desc_col).alias("desc"),
                    pl.lit(domain).alias("domain"),
                ]
            ).unique(subset=["code"])
            subset = subset.cast({"code": pl.Utf8, "desc": pl.Utf8, "domain": pl.Utf8})
            concept_codes = pl.concat([concept_codes, subset])
    concept_codes = concept_codes.unique(subset=["code", "domain"])

    # Assign concept_id using simple row index to be 1000 + x
    concept_omop = concept_codes.with_row_index("concept_id", offset=1000)

    concept_omop = concept_omop.select(
        [
            pl.col("concept_id"),
            pl.col("desc").str.slice(0, 255).alias("concept_name"),
            pl.col("domain").alias("domain_id"),
            pl.lit("SNOMED").alias("vocabulary_id"),
            pl.lit("Clinical Finding").alias("concept_class_id"),
            pl.lit("S").alias("standard_concept"),
            pl.col("code").alias("concept_code"),
            pl.lit("1970-01-01").alias("valid_start_date"),
            pl.lit("2099-12-31").alias("valid_end_date"),
            pl.lit(None).cast(pl.Utf8).alias("invalid_reason"),
        ]
    )

    code_to_concept_id = concept_omop.select(
        [pl.col("concept_code").alias("code"), pl.col("concept_id")]
    )
    return concept_omop, code_to_concept_id


def map_encounters(encounters: pl.DataFrame, id_map: pl.DataFrame):
    # Create encounter_id sequentially
    enc = encounters.with_row_index("visit_occurrence_id", offset=1)

    # Join with patients to get person_id
    enc = enc.join(id_map, left_on="PATIENT", right_on="Id", how="inner")

    # Visit concepts
    enc = enc.with_columns(
        pl.when(pl.col("ENCOUNTERCLASS") == "ambulatory")
        .then(9202)
        .when(pl.col("ENCOUNTERCLASS") == "emergency")
        .then(9203)
        .when(pl.col("ENCOUNTERCLASS") == "inpatient")
        .then(9201)
        .when(pl.col("ENCOUNTERCLASS") == "wellness")
        .then(9202)
        .when(pl.col("ENCOUNTERCLASS") == "urgentcare")
        .then(9203)
        .when(pl.col("ENCOUNTERCLASS") == "outpatient")
        .then(9202)
        .otherwise(0)
        .alias("visit_concept_id")
    )

    # Omop format
    visit_omop = enc.select(
        [
            pl.col("visit_occurrence_id"),
            pl.col("person_id"),
            pl.col("visit_concept_id"),
            pl.col("START")
            .str.to_datetime("%Y-%m-%dT%H:%M:%SZ")
            .dt.date()
            .alias("visit_start_date"),
            pl.col("START")
            .str.replace("T", " ")
            .str.replace("Z", "")
            .alias("visit_start_datetime"),
            pl.col("STOP")
            .str.to_datetime("%Y-%m-%dT%H:%M:%SZ")
            .dt.date()
            .alias("visit_end_date"),
            pl.col("STOP")
            .str.replace("T", " ")
            .str.replace("Z", "")
            .alias("visit_end_datetime"),
            pl.lit(32817).alias("visit_type_concept_id"),  # EHR
            pl.lit(0).alias("provider_id"),
            pl.lit(0).alias("care_site_id"),
            pl.col("Id").alias("visit_source_value"),
            pl.lit(0).alias("visit_source_concept_id"),
            pl.lit(0).alias("admitted_from_concept_id"),
            pl.lit(None).cast(pl.Utf8).alias("admitted_from_source_value"),
            pl.lit(0).alias("discharged_to_concept_id"),
            pl.lit(None).cast(pl.Utf8).alias("discharged_to_source_value"),
            pl.col("visit_occurrence_id").alias("preceding_visit_occurrence_id"),
        ]
    )

    visit_map = enc.select(["Id", "visit_occurrence_id"])
    return visit_omop, visit_map


def main():
    start_time = time.time()
    print("Loading Synthea CSVs into memory using Polars...")
    patients_df = pl.read_csv(
        "bronze/synthea/csv/patients.csv", infer_schema_length=10000, null_values=[""]
    )
    encounters_df = pl.read_csv(
        "bronze/synthea/csv/encounters.csv", infer_schema_length=10000, null_values=[""]
    )
    conditions_df = pl.read_csv(
        "bronze/synthea/csv/conditions.csv", infer_schema_length=10000, null_values=[""]
    )
    medications_df = pl.read_csv(
        "bronze/synthea/csv/medications.csv",
        infer_schema_length=10000,
        null_values=[""],
    )
    procedures_df = pl.read_csv(
        "bronze/synthea/csv/procedures.csv", infer_schema_length=10000, null_values=[""]
    )
    observations_df = pl.read_csv(
        "bronze/synthea/csv/observations.csv",
        infer_schema_length=10000,
        null_values=[""],
    )

    print("Generating Vocabulary Concepts dynamically...")
    concept_omop, code_map = generate_vocabulary(
        [
            (conditions_df, "CODE", "DESCRIPTION", "Condition"),
            (medications_df, "CODE", "DESCRIPTION", "Drug"),
            (procedures_df, "CODE", "DESCRIPTION", "Procedure"),
            (observations_df, "CODE", "DESCRIPTION", "Observation"),
        ]
    )

    print("Mapping Patients -> person...")
    person_omop, id_map = map_patients(patients_df)

    print("Mapping Encounters -> visit_occurrence...")
    visit_omop, visit_map = map_encounters(encounters_df, id_map)

    print("Mapping Conditions -> condition_occurrence...")
    cond = conditions_df.join(id_map, left_on="PATIENT", right_on="Id", how="inner")
    cond = cond.join(visit_map, left_on="ENCOUNTER", right_on="Id", how="left")
    cond = cond.with_columns(pl.col("CODE").cast(pl.Utf8)).join(
        code_map, left_on="CODE", right_on="code", how="left"
    )
    cond = cond.with_columns(
        pl.col("concept_id").fill_null(0), pl.col("visit_occurrence_id").fill_null(0)
    )

    cond_omop = cond.with_row_index("condition_occurrence_id", offset=1).select(
        [
            pl.col("condition_occurrence_id"),
            pl.col("person_id"),
            pl.col("concept_id").alias("condition_concept_id"),
            pl.col("START")
            .str.to_date("%Y-%m-%d", strict=False)
            .alias("condition_start_date"),
            pl.col("START")
            .str.to_datetime("%Y-%m-%d", strict=False)
            .dt.strftime("%Y-%m-%d %H:%M:%S")
            .alias("condition_start_datetime"),
            pl.col("STOP")
            .str.to_date("%Y-%m-%d", strict=False)
            .alias("condition_end_date"),
            pl.col("STOP")
            .str.to_datetime("%Y-%m-%d", strict=False)
            .dt.strftime("%Y-%m-%d %H:%M:%S")
            .alias("condition_end_datetime"),
            pl.lit(32020).alias("condition_type_concept_id"),
            pl.lit(0).alias("condition_status_concept_id"),
            pl.col("STOP").is_null().cast(pl.Utf8).alias("stop_reason"),
            pl.lit(0).alias("provider_id"),
            pl.col("visit_occurrence_id").cast(pl.Int64),
            pl.lit(0).alias("visit_detail_id"),
            pl.col("CODE").alias("condition_source_value"),
            pl.lit(0).alias("condition_source_concept_id"),
            pl.lit(None).cast(pl.Utf8).alias("condition_status_source_value"),
        ]
    )

    print("Mapping Medications -> drug_exposure...")
    drug = medications_df.join(id_map, left_on="PATIENT", right_on="Id", how="inner")
    drug = drug.join(visit_map, left_on="ENCOUNTER", right_on="Id", how="left")
    drug = drug.with_columns(pl.col("CODE").cast(pl.Utf8)).join(
        code_map, left_on="CODE", right_on="code", how="left"
    )
    drug = drug.with_columns(
        pl.col("START")
        .str.to_datetime("%Y-%m-%dT%H:%M:%SZ", strict=False)
        .dt.date()
        .alias("drug_exposure_start_date"),
        pl.col("START")
        .str.to_datetime("%Y-%m-%dT%H:%M:%SZ", strict=False)
        .dt.strftime("%Y-%m-%d %H:%M:%S")
        .alias("drug_exposure_start_datetime"),
        pl.col("STOP")
        .str.to_datetime("%Y-%m-%dT%H:%M:%SZ", strict=False)
        .dt.date()
        .alias("drug_exposure_end_date_raw"),
        pl.col("STOP")
        .str.to_datetime("%Y-%m-%dT%H:%M:%SZ", strict=False)
        .dt.strftime("%Y-%m-%d %H:%M:%S")
        .alias("drug_exposure_end_datetime_raw"),
    )
    drug = drug.with_columns(
        pl.col("drug_exposure_end_date_raw")
        .fill_null(pl.col("drug_exposure_start_date"))
        .alias("drug_exposure_end_date"),
        pl.col("drug_exposure_end_datetime_raw")
        .fill_null(pl.col("drug_exposure_start_datetime"))
        .alias("drug_exposure_end_datetime"),
    )

    drug_omop = drug.with_row_index("drug_exposure_id", offset=1).select(
        [
            pl.col("drug_exposure_id"),
            pl.col("person_id"),
            pl.col("concept_id").fill_null(0).alias("drug_concept_id"),
            pl.col("drug_exposure_start_date"),
            pl.col("drug_exposure_start_datetime"),
            pl.col("drug_exposure_end_date"),
            pl.col("drug_exposure_end_datetime"),
            pl.lit(None).cast(pl.Utf8).alias("verbatim_end_date"),
            pl.lit(38000177).alias("drug_type_concept_id"),
            pl.lit(None).cast(pl.Utf8).alias("stop_reason"),
            pl.lit(0).alias("refills"),
            pl.lit(0).alias("quantity"),
            pl.lit(0).alias("days_supply"),
            pl.lit(None).cast(pl.Utf8).alias("sig"),
            pl.lit(0).alias("route_concept_id"),
            pl.lit(None).cast(pl.Utf8).alias("lot_number"),
            pl.lit(0).alias("provider_id"),
            pl.col("visit_occurrence_id").fill_null(0).cast(pl.Int64),
            pl.lit(0).alias("visit_detail_id"),
            pl.col("CODE").alias("drug_source_value"),
            pl.lit(0).alias("drug_source_concept_id"),
            pl.lit(None).cast(pl.Utf8).alias("route_source_value"),
            pl.lit(None).cast(pl.Utf8).alias("dose_unit_source_value"),
        ]
    )

    print("Mapping Procedures -> procedure_occurrence...")
    proc = procedures_df.join(id_map, left_on="PATIENT", right_on="Id", how="inner")
    proc = proc.join(visit_map, left_on="ENCOUNTER", right_on="Id", how="left")
    proc = proc.with_columns(pl.col("CODE").cast(pl.Utf8)).join(
        code_map, left_on="CODE", right_on="code", how="left"
    )
    proc_omop = proc.with_row_index("procedure_occurrence_id", offset=1).select(
        [
            pl.col("procedure_occurrence_id"),
            pl.col("person_id"),
            pl.col("concept_id").fill_null(0).alias("procedure_concept_id"),
            pl.col("START")
            .str.to_datetime("%Y-%m-%dT%H:%M:%SZ", strict=False)
            .dt.date()
            .alias("procedure_date"),
            pl.col("START")
            .str.to_datetime("%Y-%m-%dT%H:%M:%SZ", strict=False)
            .dt.strftime("%Y-%m-%d %H:%M:%S")
            .alias("procedure_datetime"),
            pl.col("STOP")
            .str.to_datetime("%Y-%m-%dT%H:%M:%SZ", strict=False)
            .dt.date()
            .alias("procedure_end_date"),
            pl.col("STOP")
            .str.to_datetime("%Y-%m-%dT%H:%M:%SZ", strict=False)
            .dt.strftime("%Y-%m-%d %H:%M:%S")
            .alias("procedure_end_datetime"),
            pl.lit(38000275).alias("procedure_type_concept_id"),
            pl.lit(0).alias("modifier_concept_id"),
            pl.lit(0).alias("quantity"),
            pl.lit(0).alias("provider_id"),
            pl.col("visit_occurrence_id").fill_null(0).cast(pl.Int64),
            pl.lit(0).alias("visit_detail_id"),
            pl.col("CODE").alias("procedure_source_value"),
            pl.lit(0).alias("procedure_source_concept_id"),
            pl.lit(None).cast(pl.Utf8).alias("modifier_source_value"),
        ]
    )

    print("Mapping Observations -> measurement & observation...")
    obs = observations_df.join(id_map, left_on="PATIENT", right_on="Id", how="inner")
    obs = obs.join(visit_map, left_on="ENCOUNTER", right_on="Id", how="left")
    obs = obs.with_columns(pl.col("CODE").cast(pl.Utf8)).join(
        code_map, left_on="CODE", right_on="code", how="left"
    )

    meas = obs.filter(pl.col("CATEGORY").is_in(["vital-signs", "laboratory"]))
    meas_omop = meas.with_row_index("measurement_id", offset=1).select(
        [
            pl.col("measurement_id"),
            pl.col("person_id"),
            pl.col("concept_id").fill_null(0).alias("measurement_concept_id"),
            pl.col("DATE")
            .str.to_datetime("%Y-%m-%dT%H:%M:%SZ", strict=False)
            .dt.date()
            .alias("measurement_date"),
            pl.col("DATE")
            .str.to_datetime("%Y-%m-%dT%H:%M:%SZ", strict=False)
            .dt.strftime("%Y-%m-%d %H:%M:%S")
            .alias("measurement_datetime"),
            pl.lit(None).cast(pl.Utf8).alias("measurement_time"),
            pl.lit(32817).alias("measurement_type_concept_id"),
            pl.lit(0).alias("operator_concept_id"),
            pl.col("VALUE")
            .cast(pl.Float64, strict=False)
            .fill_null(0.0)
            .alias("value_as_number"),
            pl.lit(0).alias("value_as_concept_id"),
            pl.lit(0).alias("unit_concept_id"),
            pl.lit(0).alias("range_low"),
            pl.lit(0).alias("range_high"),
            pl.lit(0).alias("provider_id"),
            pl.col("visit_occurrence_id").fill_null(0).cast(pl.Int64),
            pl.lit(0).alias("visit_detail_id"),
            pl.col("CODE").alias("measurement_source_value"),
            pl.lit(0).alias("measurement_source_concept_id"),
            pl.col("UNITS").alias("unit_source_value"),
            pl.lit(None).cast(pl.Utf8).alias("unit_source_concept_id"),
            pl.col("VALUE").cast(pl.Utf8).str.slice(0, 50).alias("value_source_value"),
            pl.lit(0).alias("measurement_event_id"),
            pl.lit(0).alias("meas_event_field_concept_id"),
        ]
    )

    obs_omop_df = obs.filter(~pl.col("CATEGORY").is_in(["vital-signs", "laboratory"]))
    obs_omop = obs_omop_df.with_row_index("observation_id", offset=1).select(
        [
            pl.col("observation_id"),
            pl.col("person_id"),
            pl.col("concept_id").fill_null(0).alias("observation_concept_id"),
            pl.col("DATE")
            .str.to_datetime("%Y-%m-%dT%H:%M:%SZ", strict=False)
            .dt.date()
            .alias("observation_date"),
            pl.col("DATE")
            .str.to_datetime("%Y-%m-%dT%H:%M:%SZ", strict=False)
            .dt.strftime("%Y-%m-%d %H:%M:%S")
            .alias("observation_datetime"),
            pl.lit(32817).alias("observation_type_concept_id"),
            pl.col("VALUE")
            .cast(pl.Float64, strict=False)
            .fill_null(0.0)
            .alias("value_as_number"),
            pl.col("VALUE").cast(pl.Utf8).str.slice(0, 60).alias("value_as_string"),
            pl.lit(0).alias("value_as_concept_id"),
            pl.lit(0).alias("qualifier_concept_id"),
            pl.lit(0).alias("unit_concept_id"),
            pl.lit(0).alias("provider_id"),
            pl.col("visit_occurrence_id").fill_null(0).cast(pl.Int64),
            pl.lit(0).alias("visit_detail_id"),
            pl.col("CODE").alias("observation_source_value"),
            pl.lit(0).alias("observation_source_concept_id"),
            pl.col("UNITS").alias("unit_source_value"),
            pl.lit(0).alias("qualifier_source_value"),
            pl.lit(None).cast(pl.Utf8).alias("value_source_value"),
            pl.lit(0).alias("observation_event_id"),
            pl.lit(0).alias("obs_event_field_concept_id"),
        ]
    )

    print("Connecting to DB...")
    with psycopg.connect(
        settings.database_url.replace("postgresql+psycopg", "postgresql")
    ) as conn:
        with conn.cursor() as cur:
            # Set search path to tenant
            schema = settings.tenant_schemas[0]
            vocab_schema = settings.vocab_schema
            print(f"Setting search_path to {schema}, {vocab_schema}")

            # Delete exiting data to support rerun
            cur.execute(f"TRUNCATE TABLE {schema}.condition_era CASCADE;")
            cur.execute(f"TRUNCATE TABLE {schema}.drug_era CASCADE;")
            cur.execute(f"TRUNCATE TABLE {schema}.observation CASCADE;")
            cur.execute(f"TRUNCATE TABLE {schema}.measurement CASCADE;")
            cur.execute(f"TRUNCATE TABLE {schema}.procedure_occurrence CASCADE;")
            cur.execute(f"TRUNCATE TABLE {schema}.drug_exposure CASCADE;")
            cur.execute(f"TRUNCATE TABLE {schema}.condition_occurrence CASCADE;")
            cur.execute(f"TRUNCATE TABLE {schema}.visit_occurrence CASCADE;")
            cur.execute(f"TRUNCATE TABLE {schema}.person CASCADE;")
            cur.execute(f"TRUNCATE TABLE {vocab_schema}.concept CASCADE;")
            conn.commit()

        # Load Vocab
        dict_to_pg_copy(conn, concept_omop, "concept", vocab_schema)
        # Load Patient
        dict_to_pg_copy(conn, person_omop, "person", schema)
        # Load Encounter
        dict_to_pg_copy(conn, visit_omop, "visit_occurrence", schema)
        # Load Condition
        dict_to_pg_copy(conn, cond_omop, "condition_occurrence", schema)
        # Load Drug
        dict_to_pg_copy(conn, drug_omop, "drug_exposure", schema)
        # Load Procedure
        dict_to_pg_copy(conn, proc_omop, "procedure_occurrence", schema)
        # Load Measurement
        dict_to_pg_copy(conn, meas_omop, "measurement", schema)
        # Load Observation
        dict_to_pg_copy(conn, obs_omop, "observation", schema)

        print("Generating Eras natively in PG...")
        with conn.cursor() as cur:
            cur.execute(f"""
                INSERT INTO {schema}.condition_era (condition_era_id, person_id, condition_concept_id, condition_era_start_date, condition_era_end_date, condition_occurrence_count)
                SELECT 
                    row_number() over() as condition_era_id,
                    person_id,
                    condition_concept_id,
                    MIN(condition_start_date) as condition_era_start_date,
                    MAX(COALESCE(condition_end_date, condition_start_date)) as condition_era_end_date,
                    COUNT(*) as condition_occurrence_count
                FROM {schema}.condition_occurrence
                GROUP BY person_id, condition_concept_id;
            """)
            cur.execute(f"""
                INSERT INTO {schema}.drug_era (drug_era_id, person_id, drug_concept_id, drug_era_start_date, drug_era_end_date, drug_exposure_count, gap_days)
                SELECT 
                    row_number() over() as drug_era_id,
                    person_id,
                    drug_concept_id,
                    MIN(drug_exposure_start_date) as drug_era_start_date,
                    MAX(COALESCE(drug_exposure_end_date, drug_exposure_start_date)) as drug_era_end_date,
                    COUNT(*) as drug_exposure_count,
                    0 as gap_days
                FROM {schema}.drug_exposure
                GROUP BY person_id, drug_concept_id;
            """)
            conn.commit()

    end_time = time.time()
    print(f"OMOP ETL Execution finished in {end_time - start_time:.2f} seconds!")


if __name__ == "__main__":
    main()
