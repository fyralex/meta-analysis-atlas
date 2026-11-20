# Runs the R service's tests: Rscript tests/testthat.R, from r_service/.
library(testthat)
source("R/executor.R")
test_dir("tests/testthat", stop_on_failure = TRUE)
