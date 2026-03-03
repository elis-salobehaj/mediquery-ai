FROM eclipse-temurin:17-jdk
WORKDIR /app

# Install git and other essentials
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Clone the Synthea repository
RUN git clone https://github.com/synthetichealth/synthea.git .

# Pre-build to cache gradle dependencies
RUN ./gradlew build -x test

# Keep the entrypoint to the wrapper scripts
ENTRYPOINT ["./run_synthea"]
