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
