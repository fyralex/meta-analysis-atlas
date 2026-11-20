# The executor runs structured plans (decision 0018, #142).
#
# Validation: BCG vaccine trials (dat.bcg, in metadat, which metafor uses for its examples), log risk ratios,
# random effects (REML).
# Source: metafor, rma.uni() reference page, first example
# (https://wviechtb.github.io/metafor/reference/rma.uni.html): estimate -0.7145, se 0.1798,
# zval -3.9744, ci -1.0669 to -0.3622, tau^2 0.3132, I^2 92.22%, Q(df = 12) = 152.2330.
# Tolerances: the plan must match metafor called directly to 1e-10 (the same computation); the
# printed values are rounded to 4 decimals (2 for I^2), so they are compared to half a unit in
# that place.

bcg <- function() {
  d <- metadat::dat.bcg
  list(trial = d$trial, tpos = d$tpos, tneg = d$tneg, cpos = d$cpos, cneg = d$cneg)
}

RE_MODEL <- list(fn = "rma.uni", args = list(
  yi = list(column = "yi"), vi = list(column = "vi"), method = "REML", slab = list(column = "trial")
))

rr_plan <- function(model = RE_MODEL, ...) {
  c(list(
    effect = list(fn = "escalc", args = list(
      measure = "RR",
      ai = list(column = "tpos"), bi = list(column = "tneg"),
      ci = list(column = "cpos"), di = list(column = "cneg")
    )),
    model = model
  ), list(...))
}

test_that("a plan gives what metafor gives when called directly", {
  out <- execute_plan(rr_plan(), bcg())
  expect_true(out$success)
  direct <- metafor::rma(measure = "RR", ai = tpos, bi = tneg, ci = cpos, di = cneg, data = metadat::dat.bcg)
  s <- out$results$summary
  expect_equal(s$estimate, unname(direct$b[[1]]), tolerance = 1e-10)
  expect_equal(s$se, unname(direct$se), tolerance = 1e-10)
  expect_equal(s$tau2, direct$tau2, tolerance = 1e-10)
  expect_equal(s$i2, direct$I2, tolerance = 1e-10)
  expect_equal(s$k, 13L)
})

test_that("a plan reproduces the values metafor's documentation prints", {
  s <- execute_plan(rr_plan(), bcg())$results$summary
  expect_equal(s$estimate, -0.7145, tolerance = 5e-5, scale = 1)
  expect_equal(s$se, 0.1798, tolerance = 5e-5, scale = 1)
  expect_equal(s$zval, -3.9744, tolerance = 5e-5, scale = 1)
  expect_equal(s$ci_lower, -1.0669, tolerance = 5e-5, scale = 1)
  expect_equal(s$ci_upper, -0.3622, tolerance = 5e-5, scale = 1)
  expect_equal(s$tau2, 0.3132, tolerance = 5e-5, scale = 1)
  expect_equal(s$i2, 92.22, tolerance = 5e-3, scale = 1)
  expect_equal(s$q, 152.2330, tolerance = 5e-5, scale = 1)
})

test_that("only the outputs asked for are returned", {
  s <- execute_plan(rr_plan(outputs = list("estimate", "k")), bcg())$results$summary
  expect_equal(names(s), c("estimate", "k"))
})

test_that("a leave-one-out step returns one row per study", {
  out <- execute_plan(rr_plan(post = list(fn = "leave1out")), bcg())
  expect_true(out$success)
  rows <- out$results$steps
  expect_equal(nrow(rows), 13L)
  expect_equal(rows$study[[1]], as.character(metadat::dat.bcg$trial[[1]]))
  fit <- metafor::rma(measure = "RR", ai = tpos, bi = tneg, ci = cpos, di = cneg, data = metadat::dat.bcg)
  direct <- metafor::leave1out(fit)
  expect_equal(rows$estimate, direct$estimate, tolerance = 1e-10)
})

test_that("a Mantel-Haenszel plan reads the counts directly", {
  plan <- list(model = list(fn = "rma.mh", args = list(
    measure = "OR",
    ai = list(column = "tpos"), bi = list(column = "tneg"),
    ci = list(column = "cpos"), di = list(column = "cneg")
  )))
  out <- execute_plan(plan, bcg())
  expect_true(out$success)
  direct <- metafor::rma.mh(measure = "OR", ai = tpos, bi = tneg, ci = cpos, di = cneg, data = metadat::dat.bcg)
  expect_equal(out$results$summary$estimate, unname(direct$b[[1]]), tolerance = 1e-10)
})

test_that("a function outside the allow-list is refused, and nothing is evaluated", {
  for (fn in c("system", "eval", "Sys.setenv", "rma.mv")) {
    out <- execute_plan(list(model = list(fn = fn, args = list())), bcg())
    expect_false(out$success)
    expect_equal(out$kind, "plan")
    expect_match(out$error, "is not allowed as the model step")
  }
  out <- execute_plan(rr_plan(post = list(fn = "unlink", args = list(x = "."))), bcg())
  expect_false(out$success)
  expect_match(out$error, "is not allowed as the post step")
})

test_that("arguments must be plain values or columns that exist", {
  missing <- rr_plan(model = list(fn = "rma.uni", args = list(yi = list(column = "nope"), vi = list(column = "vi"))))
  expect_match(execute_plan(missing, bcg())$error, "there is no column nope")
  args <- list(yi = list(column = "yi"), vi = list(column = "vi"), method = list(expr = "x"))
  code <- rr_plan(model = list(fn = "rma.uni", args = args))
  expect_match(execute_plan(code, bcg())$error, "must be a column reference")
  unnamed <- list(model = list(fn = "rma.uni", args = list(1, 2)))
  expect_match(execute_plan(unnamed, bcg())$error, "must be named")
})

test_that("bad data and a missing model step are refused", {
  expect_match(execute_plan(list(), bcg())$error, "needs a model step")
  expect_match(execute_plan(rr_plan(), list(a = 1:2, b = 1:3))$error, "same number of rows")
  expect_match(execute_plan(rr_plan(), list())$error, "named columns")
})

test_that("an error inside metafor is reported as such", {
  args <- list(yi = list(column = "yi"), vi = list(column = "vi"), method = "NOPE")
  plan <- rr_plan(model = list(fn = "rma.uni", args = args))
  out <- execute_plan(plan, bcg())
  expect_false(out$success)
  expect_equal(out$kind, "r")
})

test_that("arguments metafor evaluates as code are refused, so a plan can't run code (#143 audit)", {
  marker <- tempfile()
  code <- sprintf("file.create('%s')", marker)
  model_with <- function(extra) {
    rr_plan(model = list(fn = "rma.uni", args = c(list(yi = list(column = "yi"), vi = list(column = "vi")), extra)))
  }
  hostile <- list(
    rr_plan(post = list(fn = "leave1out", args = list(code1 = code))),
    rr_plan(post = list(fn = "cumul", args = list(code2 = code))),
    model_with(list(outlist = code)),
    model_with(list(outlistx = code)),
    model_with(list(mods = "~ 1")),
    rr_plan(post = list(fn = "leave1out", args = list(transf = "exp")))
  )
  for (plan in hostile) {
    out <- execute_plan(plan, bcg())
    expect_false(out$success)
    expect_equal(out$kind, "plan")
    expect_match(out$error, "does not take")
  }
  expect_false(file.exists(marker))
})

test_that("a malformed plan is a plan error, not an R error", {
  expect_equal(execute_plan(list(model = "system"), bcg())$kind, "plan")
  expect_equal(execute_plan(list(model = list(fn = "rma.uni", args = list(), extra = 1)), bcg())$kind, "plan")
  out <- execute_plan(c(rr_plan(), list(sneaky = list(fn = "system"))), bcg())
  expect_equal(out$kind, "plan")
  expect_match(out$error, "only these keys")
  # no partial matching: "mod" isn't "model"
  expect_match(execute_plan(list(mod = list(fn = "rma.uni")), bcg())$error, "only these keys")
  ref <- list(yi = list(column = "yi", extra = 1), vi = list(column = "vi"))
  expect_match(execute_plan(rr_plan(model = list(fn = "rma.uni", args = ref)), bcg())$error, "column reference")
})

# Study rows and the prediction interval (#146): checked against metafor called directly on the same data.
zeros <- function() {
  list(
    study = c("A", "B", "C", "D"),
    ai = c(0, 2, 0, 4), n1i = c(10, 10, 10, 12), ci = c(0, 3, 1, 6), n2i = c(10, 10, 10, 11)
  )
}
COUNT_ARGS <- list(
  ai = list(column = "ai"), n1i = list(column = "n1i"), ci = list(column = "ci"), n2i = list(column = "n2i"),
  slab = list(column = "study")
)

test_that("each study's estimate, variance and weight are those metafor gives", {
  out <- execute_plan(rr_plan(), bcg())
  rows <- out$results$studies
  fit <- metafor::rma(measure = "RR", ai = tpos, bi = tneg, ci = cpos, di = cneg, data = metadat::dat.bcg)
  expect_equal(nrow(rows), 13L)
  expect_equal(rows$study, as.character(metadat::dat.bcg$trial))
  expect_equal(rows$yi, as.numeric(fit$yi), tolerance = 1e-10)
  expect_equal(rows$vi, as.numeric(fit$vi), tolerance = 1e-10)
  expect_equal(rows$weight, unname(weights(fit)), tolerance = 1e-10)
  expect_true(all(rows$used))
})

test_that("the prediction interval is predict()'s, and null where the model has none", {
  s <- execute_plan(rr_plan(), bcg())$results$summary
  p <- predict(metafor::rma(measure = "RR", ai = tpos, bi = tneg, ci = cpos, di = cneg, data = metadat::dat.bcg))
  expect_equal(c(s$pi_lower, s$pi_upper), c(p$pi.lb, p$pi.ub), tolerance = 1e-10)
  mh <- list(model = list(fn = "rma.mh", args = c(list(measure = "OR"), COUNT_ARGS)))
  s <- suppressWarnings(execute_plan(mh, zeros()))$results$summary # study A is double-zero
  expect_true(is.na(s$pi_lower) && is.na(s$pi_upper))
  expect_equal(s$tau2, 0) # rma.mh stores tau2 as 0: a common-effect model
})

test_that("a double-zero study left out by drop00 has no weight and isn't used", {
  plan <- list(
    effect = list(fn = "escalc", args = c(list(measure = "OR", drop00 = TRUE), COUNT_ARGS)),
    model = list(fn = "rma.uni", args = list(
      yi = list(column = "yi"), vi = list(column = "vi"), slab = list(column = "study")
    ))
  )
  rows <- suppressWarnings(execute_plan(plan, zeros()))$results$studies
  d <- as.data.frame(zeros())
  e <- metafor::escalc(measure = "OR", ai = ai, n1i = n1i, ci = ci, n2i = n2i, data = d, drop00 = TRUE)
  fit <- suppressWarnings(metafor::rma.uni(yi, vi, data = e, slab = study))
  expect_equal(rows$study, c("A", "B", "C", "D"))
  expect_equal(rows$used, c(FALSE, TRUE, TRUE, TRUE))
  expect_true(is.na(rows$weight[[1]]) && is.na(rows$yi[[1]]))
  expect_equal(rows$weight[2:4], unname(weights(fit)), tolerance = 1e-10)
})

test_that("Mantel-Haenszel and Peto give a double-zero study zero weight", {
  for (fn in c("rma.mh", "rma.peto")) {
    args <- if (fn == "rma.mh") c(list(measure = "OR"), COUNT_ARGS) else COUNT_ARGS
    rows <- suppressWarnings(execute_plan(list(model = list(fn = fn, args = args)), zeros()))$results$studies
    d <- as.data.frame(zeros())
    fit <- suppressWarnings(if (fn == "rma.mh") {
      metafor::rma.mh(measure = "OR", ai = ai, n1i = n1i, ci = ci, n2i = n2i, data = d, slab = study)
    } else {
      metafor::rma.peto(ai = ai, n1i = n1i, ci = ci, n2i = n2i, data = d, slab = study)
    })
    expect_equal(rows$weight, unname(weights(fit)), tolerance = 1e-10)
    expect_equal(rows$used, c(FALSE, TRUE, TRUE, TRUE))
    expect_equal(rows$yi, as.numeric(fit$yi.f), tolerance = 1e-10)
  }
})

# Q's degrees of freedom as metafor prints them ("Q(df = 12)"), which counts only the studies with an estimate
printed_df <- function(fit) {
  line <- grep("Q\\(df = ", utils::capture.output(print(fit)), value = TRUE)[[1]]
  as.numeric(sub(".*Q\\(df = ([0-9]+)\\).*", "\\1", line))
}

test_that("Q's degrees of freedom are those metafor prints, without double-zero studies (#180 audit)", {
  expect_equal(execute_plan(rr_plan(), bcg())$results$summary$q_df, 12) # rma.uni reference page: Q(df = 12)
  d <- as.data.frame(zeros()) # study A is double-zero
  for (fn in c("rma.mh", "rma.peto")) {
    args <- if (fn == "rma.mh") c(list(measure = "OR"), COUNT_ARGS) else COUNT_ARGS
    s <- suppressWarnings(execute_plan(list(model = list(fn = fn, args = args)), zeros()))$results$summary
    fit <- suppressWarnings(if (fn == "rma.mh") {
      metafor::rma.mh(measure = "OR", ai = ai, n1i = n1i, ci = ci, n2i = n2i, data = d)
    } else {
      metafor::rma.peto(ai = ai, n1i = n1i, ci = ci, n2i = n2i, data = d)
    })
    expect_equal(s$k, 4)
    expect_equal(s$q_df, printed_df(fit))
    expect_equal(s$q_df, 2)
  }
  plan <- list(
    effect = list(fn = "escalc", args = c(list(measure = "OR", drop00 = TRUE), COUNT_ARGS)),
    model = list(fn = "rma.uni", args = list(yi = list(column = "yi"), vi = list(column = "vi")))
  )
  s <- suppressWarnings(execute_plan(plan, zeros()))$results$summary
  expect_equal(s$q_df, 2)
  # every study double-zero: rma.mh still fits, with k.yi = 0, and metafor prints Q(df = 0)
  none <- list(study = c("A", "B"), ai = c(0, 0), n1i = c(10, 10), ci = c(0, 0), n2i = c(10, 10))
  mh <- list(model = list(fn = "rma.mh", args = c(list(measure = "OR"), COUNT_ARGS)))
  s <- suppressWarnings(execute_plan(mh, none))$results$summary
  d0 <- as.data.frame(none)
  fit <- suppressWarnings(metafor::rma.mh(measure = "OR", ai = ai, n1i = n1i, ci = ci, n2i = n2i, data = d0))
  expect_equal(s$q_df, printed_df(fit))
  expect_equal(s$q_df, 0)
})
