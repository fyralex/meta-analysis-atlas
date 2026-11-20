# The R service (decision 0006). Packages are pinned in renv.lock.
FROM rocker/r-ver:4.5.3

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libcurl4-openssl-dev libssl-dev libsodium-dev libxml2-dev libuv1-dev zlib1g-dev curl \
 && rm -rf /var/lib/apt/lists/*

# Posit's prebuilt Linux packages for this Ubuntu release: the versions in renv.lock, without compiling
ENV RENV_CONFIG_REPOS_OVERRIDE=https://p3m.dev/cran/__linux__/noble/latest

WORKDIR /app
COPY renv.lock DESCRIPTION ./
# renv itself at the version renv.lock records
RUN R -q -e 'install.packages("https://cloud.r-project.org/src/contrib/Archive/renv/renv_1.2.4.tar.gz", repos = NULL, type = "source")' \
 && R -q -e 'renv::restore(lockfile = "renv.lock", library = .libPaths()[1], prompt = FALSE)'

COPY R ./R
COPY tests ./tests
COPY plumber.R run.R .lintr ./

# the tests run in the image, so it never ships with failing ones
RUN Rscript tests/testthat.R

ENV R_SERVICE_PORT=8000
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:8000/health || exit 1
USER 1000
CMD ["Rscript", "run.R"]
