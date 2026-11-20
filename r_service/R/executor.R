# Runs a structured analysis plan (decision 0018, #142).
#
# The backend decides what is valid, from the map, and sends a plan: a fixed
# sequence of steps, each naming a function from ALLOWED and giving its
# arguments. An argument is a plain value (a string, number or logical, or a
# vector of them) or a reference to a data column, written list(column = "ai").
# Nothing is ever evaluated from text: each function is looked up in ALLOWED
# and called with do.call(). The service returns numbers only.
#
# A plan:
#   effect  optional  list(fn = "escalc", args = list(...))
#                     its yi and vi are added to the data the next step reads
#   model   required  list(fn = "rma.uni" | "rma.mh" | "rma.peto", args = list(...))
#   post    optional  list(fn = "cumul" | "leave1out", args = list(...))
#                     run on the fitted model
#   outputs optional  names of the summary values to return (OUTPUTS); all by default

ALLOWED <- list(
  effect = list(escalc = metafor::escalc),
  model = list(
    rma.uni = metafor::rma.uni,
    rma.mh = metafor::rma.mh,
    rma.peto = metafor::rma.peto
  ),
  post = list(
    cumul = metafor::cumul,
    leave1out = metafor::leave1out
  )
)

# The summary values a fitted model can return, by name.
OUTPUTS <- list(
  estimate = function(fit) unname(fit$b[[1]]),
  se = function(fit) unname(fit$se[[1]]),
  ci_lower = function(fit) unname(fit$ci.lb[[1]]),
  ci_upper = function(fit) unname(fit$ci.ub[[1]]),
  zval = function(fit) unname(fit$zval[[1]]),
  pval = function(fit) unname(fit$pval[[1]]),
  tau2 = function(fit) fit$tau2,
  i2 = function(fit) fit$I2,
  h2 = function(fit) fit$H2,
  q = function(fit) fit$QE,
  q_pval = function(fit) fit$QEp,
  k = function(fit) fit$k
)

plan_error <- function(message) {
  structure(class = c("plan_error", "error", "condition"), list(message = message, call = NULL))
}

# A step's function, from the allow-list for its kind.
step_function <- function(kind, step) {
  fn <- step$fn
  if (!is.character(fn) || length(fn) != 1) {
    stop(plan_error(sprintf("The %s step must name one function.", kind)))
  }
  allowed <- ALLOWED[[kind]]
  if (!fn %in% names(allowed)) {
    stop(plan_error(sprintf(
      "%s is not allowed as the %s step; allowed: %s.", fn, kind, paste(names(allowed), collapse = ", ")
    )))
  }
  allowed[[fn]]
}

# A step's arguments: plain values as they are, column references taken from the data.
step_arguments <- function(args, data) {
  if (is.null(args)) {
    return(list())
  }
  if (!is.list(args) || (length(args) > 0 && is.null(names(args))) || any(names(args) == "")) {
    stop(plan_error("A step's arguments must be named."))
  }
  lapply(names(args), function(name) {
    value <- args[[name]]
    if (is.list(value)) {
      column <- value$column
      if (length(value) != 1 || !is.character(column) || length(column) != 1) {
        stop(plan_error(sprintf("Argument %s: a list must be a column reference, list(column = \"<name>\").", name)))
      }
      if (!column %in% names(data)) {
        stop(plan_error(sprintf("Argument %s: there is no column %s in the data.", name, column)))
      }
      return(data[[column]])
    }
    if (!(is.character(value) || is.numeric(value) || is.logical(value))) {
      stop(plan_error(sprintf("Argument %s must be a string, number or logical value.", name)))
    }
    value
  }) |> stats::setNames(names(args))
}

# The data as a data frame: a list of equal-length columns.
as_data <- function(data) {
  if (!is.list(data) || length(data) == 0 || is.null(names(data))) {
    stop(plan_error("The data must be a set of named columns."))
  }
  lengths <- vapply(data, length, integer(1))
  if (length(unique(lengths)) != 1) {
    stop(plan_error("Every data column must have the same number of rows."))
  }
  as.data.frame(data, stringsAsFactors = FALSE)
}

summary_values <- function(fit, outputs) {
  names <- if (is.null(outputs)) names(OUTPUTS) else unlist(outputs)
  unknown <- setdiff(names, names(OUTPUTS))
  if (length(unknown) > 0) {
    stop(plan_error(sprintf("Unknown output: %s.", paste(unknown, collapse = ", "))))
  }
  stats::setNames(lapply(names, function(n) OUTPUTS[[n]](fit)), names)
}

# A cumulative or leave-one-out result as rows. study names the study added (cumul) or left out
# (leave1out); metafor 5 writes leave1out's labels as "-<label>", so the dash is dropped.
post_rows <- function(result, fn) {
  rows <- list(
    estimate = result$estimate,
    se = result$se,
    ci_lower = result$ci.lb,
    ci_upper = result$ci.ub,
    zval = result$zval,
    pval = result$pval,
    tau2 = result$tau2,
    i2 = result$I2
  )
  rows <- rows[!vapply(rows, is.null, logical(1))]
  study <- as.character(result$slab)
  if (fn == "leave1out") study <- sub("^-", "", study)
  as.data.frame(c(list(study = study), rows), stringsAsFactors = FALSE)
}

# Runs a plan on the data. Returns list(success = TRUE, results = ...) or
# list(success = FALSE, error = ...).
execute_plan <- function(plan, data) {
  tryCatch(
    {
      if (!is.list(plan) || is.null(plan$model)) {
        stop(plan_error("A plan needs a model step."))
      }
      frame <- as_data(data)
      if (!is.null(plan$effect)) {
        fn <- step_function("effect", plan$effect)
        effects <- do.call(fn, step_arguments(plan$effect$args, frame))
        # keep the data's own columns (labels, moderators) beside yi and vi
        frame <- cbind(frame[setdiff(names(frame), names(effects))], as.data.frame(effects))
      }
      fit <- do.call(step_function("model", plan$model), step_arguments(plan$model$args, frame))
      results <- list(summary = summary_values(fit, plan$outputs))
      if (!is.null(plan$post)) {
        fn <- step_function("post", plan$post)
        rows <- do.call(fn, c(list(fit), step_arguments(plan$post$args, frame)))
        results$steps <- post_rows(rows, plan$post$fn)
      }
      list(success = TRUE, results = results)
    },
    plan_error = function(e) list(success = FALSE, error = conditionMessage(e), kind = "plan"),
    error = function(e) list(success = FALSE, error = conditionMessage(e), kind = "r")
  )
}
