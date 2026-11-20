# The R service's API (decision 0006, #142). It runs structured plans the
# backend builds from the map, and returns numbers only. It holds no rules
# about what is valid; see R/executor.R for what a plan may contain.

library(jsonlite)
source("R/executor.R")

#* Whether the service is up, and the versions of R and metafor it runs.
#* @get /health
#* @serializer unboxedJSON list(digits = I(17), na = "null")
function() {
  list(
    status = "ok",
    r = paste(R.version$major, R.version$minor, sep = "."),
    metafor = as.character(utils::packageVersion("metafor"))
  )
}

#* Runs a plan on the data sent with it.
#* Body: {"plan": {...}, "data": {"<column>": [...], ...}}
#* @post /execute
#* @serializer unboxedJSON list(digits = I(17), na = "null")
function(req, res) {
  body <- tryCatch(
    jsonlite::fromJSON(req$postBody, simplifyVector = TRUE, simplifyDataFrame = FALSE),
    error = function(e) NULL
  )
  if (is.null(body) || is.null(body$plan) || is.null(body$data)) {
    res$status <- 400
    return(list(success = FALSE, error = "The body must be JSON with a plan and data.", kind = "request"))
  }
  out <- execute_plan(body$plan, body$data)
  if (!isTRUE(out$success)) {
    res$status <- if (identical(out$kind, "plan")) 400 else 422
  }
  out
}
