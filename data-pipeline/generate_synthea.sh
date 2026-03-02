#!/usr/bin/env bash
set -e

# Defaults
POPULATION_SIZE=${1:-50}
SEED=${2:-42}
OUTPUT_DIR="$(pwd)/bronze/synthea"

echo "================================================="
echo "Building Synthea Docker Image"
echo "================================================="
docker build -t mediquery-synthea ./synthea

echo "================================================="
echo "Generating Synthea Data"
echo "Population Size: $POPULATION_SIZE"
echo "Random Seed: $SEED"
echo "Output Directory: $OUTPUT_DIR"
echo "================================================="

mkdir -p "$OUTPUT_DIR"

# Turn ON CSV exports, turn OFF FHIR
docker run --rm \
    -e _JAVA_OPTIONS="-Xmx2g" \
    -v "$OUTPUT_DIR:/app/output" \
    mediquery-synthea \
    -p "$POPULATION_SIZE" \
    -s "$SEED" \
    --exporter.csv.export=true \
    --exporter.fhir.export=false \
    --exporter.hospital.fhir.export=false \
    --exporter.practitioner.fhir.export=false

echo "================================================="
echo "Generation Complete!"
echo "Check folder: $OUTPUT_DIR/csv"
echo "================================================="
