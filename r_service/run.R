# Starts the R service. The port comes from R_SERVICE_PORT (8000 by default).
port <- as.integer(Sys.getenv("R_SERVICE_PORT", "8000"))
plumber::pr_run(plumber::pr("plumber.R"), host = "0.0.0.0", port = port)
