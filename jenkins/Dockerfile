FROM jenkins/jenkins:lts-jdk21
USER root
RUN apt-get update && apt-get install -y --no-install-recommends docker-cli git \
    && rm -rf /var/lib/apt/lists/*
USER jenkins
RUN jenkins-plugin-cli --plugins git workflow-aggregator github nodejs \
    sonar docker-workflow credentials-binding timestamper
