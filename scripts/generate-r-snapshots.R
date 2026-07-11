#!/usr/bin/env Rscript
# Golden-fixture generator for sna.js parity tests.
#
# Runs R sna (pinned: 2.8) over a deterministic graph corpus and records the
# results as JSON under fixtures/r-sna-2.8/. The vitest parity suite replays
# every case against the TypeScript port with a numeric tolerance.
#
# Usage: Rscript scripts/generate-r-snapshots.R
# Requires: R >= 4.x, sna == 2.8, jsonlite.

suppressMessages({
  library(sna)
  library(jsonlite)
})

stopifnot(as.character(packageVersion("sna")) == "2.8")

out_dir <- file.path("fixtures", "r-sna-2.8")
dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)

## ---------------------------------------------------------------- corpus ----
set.seed(42)
sparse50 <- rgraph(50, tprob = 0.06)
set.seed(7)
valued20 <- matrix(sample(0:5, 400, replace = TRUE, prob = c(.62, .14, .08, .06, .06, .04)), 20, 20)
diag(valued20) <- 0
set.seed(9)
na20 <- rgraph(20, tprob = 0.15)
na_mask <- matrix(runif(400) < 0.1, 20, 20)
diag(na_mask) <- FALSE
na20[na_mask] <- NA

graphs <- list(
  k1        = matrix(0, 1, 1),
  p3        = rbind(c(0,1,0), c(1,0,1), c(0,1,0)),
  p4        = rbind(c(0,1,0,0), c(1,0,1,0), c(0,1,0,1), c(0,0,1,0)),
  star5out  = rbind(c(0,1,1,1,1), matrix(0, 4, 5)),
  star5sym  = rbind(c(0,1,1,1,1), c(1,0,0,0,0), c(1,0,0,0,0), c(1,0,0,0,0), c(1,0,0,0,0)),
  ring5     = rbind(c(0,1,0,0,0), c(0,0,1,0,0), c(0,0,0,1,0), c(0,0,0,0,1), c(1,0,0,0,0)),
  k23       = rbind(c(0,0,1,1,1), c(0,0,1,1,1), c(1,1,0,0,0), c(1,1,0,0,0), c(1,1,0,0,0)),
  t030      = rbind(c(0,1,1), c(0,0,1), c(0,0,0)),
  asym3     = rbind(c(0,1,0), c(0,0,0), c(0,0,0)),
  loopy3    = rbind(c(2,1,0), c(0,3,1), c(1,0,0)),
  wtri      = rbind(c(0,2,5), c(2,0,2), c(5,2,0)),
  disc7     = rbind(c(0,1,0,0,0,0,0), c(1,0,1,0,0,0,0), c(0,1,0,0,0,0,0),
                    c(0,0,0,0,1,0,1), c(0,0,0,1,0,1,0), c(0,0,0,0,1,0,1), c(0,0,0,1,0,1,0)),
  iso5      = rbind(c(0,1,0,0,0), c(1,0,1,0,0), c(0,1,0,0,0), c(0,0,0,0,0), c(0,0,0,0,0)),
  paw4      = rbind(c(0,1,1,0), c(1,0,1,0), c(1,1,0,1), c(0,0,1,0)),
  sparse50  = sparse50,
  valued20  = valued20,
  na20      = na20
)

## --------------------------------------------------------------- helpers ----
# Encode numbers losslessly: NA/NaN/Inf become tagged strings.
sanitize <- function(x) {
  if (is.list(x)) return(lapply(x, sanitize))
  if (is.matrix(x)) return(apply(x, 1, function(row) sanitize(as.vector(row)), simplify = FALSE))
  if (is.numeric(x) || is.logical(x)) {
    return(lapply(as.vector(x), function(v) {
      if (is.na(v) && !is.nan(v)) return("NA")
      if (is.nan(v)) return("NaN")
      if (is.infinite(v)) return(if (v > 0) "Inf" else "-Inf")
      as.numeric(v)
    }))
  }
  x
}

cases <- list()
skipped <- character()

snap <- function(id, fn, graph, options, expr, data = NULL) {
  value <- tryCatch(expr, error = function(e) e)
  if (inherits(value, "error")) {
    skipped <<- c(skipped, paste0(id, " :: ", conditionMessage(value)))
    return(invisible(NULL))
  }
  entry <- list(
    id = id, fn = fn, graph = graph,
    options = options, expected = sanitize(value)
  )
  if (!is.null(data)) entry$data <- lapply(data, sanitize)
  cases[[length(cases) + 1]] <<- entry
  invisible(NULL)
}

opts <- function(...) {
  o <- list(...)
  if (length(o) == 0) setNames(list(), character()) else o
}

## ----------------------------------------------------------------- cases ----
## degree ---------------------------------------------------------------------
for (g in c("p4", "star5out", "ring5", "t030", "sparse50", "valued20", "na20", "asym3")) {
  m <- graphs[[g]]
  for (cm in c("freeman", "indegree", "outdegree")) {
    for (ie in c(FALSE, TRUE)) {
      snap(sprintf("degree/%s/digraph-%s-ie%s", g, cm, ie), "degree", g,
           opts(mode = "digraph", cmode = cm, ignoreEval = ie),
           degree(m, gmode = "digraph", cmode = cm, ignore.eval = ie))
    }
  }
}
for (g in c("p4", "k23", "asym3", "valued20")) {
  m <- graphs[[g]]
  snap(sprintf("degree/%s/graph-default", g), "degree", g, opts(mode = "graph"),
       degree(m, gmode = "graph"))
}
snap("degree/loopy3/digraph-diag-valued", "degree", "loopy3",
     opts(mode = "digraph", diag = TRUE),
     degree(graphs$loopy3, gmode = "digraph", diag = TRUE))
snap("degree/loopy3/digraph-diag-binary", "degree", "loopy3",
     opts(mode = "digraph", diag = TRUE, ignoreEval = TRUE),
     degree(graphs$loopy3, gmode = "digraph", diag = TRUE, ignore.eval = TRUE))
snap("degree/p4/digraph-rescale", "degree", "p4",
     opts(mode = "digraph", rescale = TRUE),
     degree(graphs$p4, gmode = "digraph", rescale = TRUE))
for (g in c("p4", "star5out")) {
  for (cm in c("freeman", "indegree", "outdegree")) {
    snap(sprintf("degree/%s/tmaxdev-%s", g, cm), "degree", g,
         opts(mode = "digraph", cmode = cm, tmaxdev = TRUE),
         degree(graphs[[g]], gmode = "digraph", cmode = cm, tmaxdev = TRUE))
  }
}

## gden -----------------------------------------------------------------------
for (g in c("p4", "star5out", "sparse50", "valued20", "na20", "asym3")) {
  m <- graphs[[g]]
  for (ie in c(FALSE, TRUE)) {
    snap(sprintf("gden/%s/digraph-ie%s", g, ie), "gden", g,
         opts(mode = "digraph", ignoreEval = ie),
         gden(m, mode = "digraph", ignore.eval = ie))
  }
}
for (g in c("p4", "k23", "asym3")) {
  snap(sprintf("gden/%s/graph", g), "gden", g, opts(mode = "graph"),
       gden(graphs[[g]], mode = "graph"))
}
snap("gden/loopy3/digraph-diag", "gden", "loopy3", opts(mode = "digraph", diag = TRUE),
     gden(graphs$loopy3, mode = "digraph", diag = TRUE))
snap("gden/k1/digraph", "gden", "k1", opts(mode = "digraph"), gden(graphs$k1, mode = "digraph"))
snap("gden/k1/digraph-diag", "gden", "k1", opts(mode = "digraph", diag = TRUE),
     gden(graphs$k1, mode = "digraph", diag = TRUE))

## nties ----------------------------------------------------------------------
for (g in c("p4", "sparse50")) {
  for (md in c("digraph", "graph")) {
    snap(sprintf("nties/%s/%s", g, md), "nties", g, opts(mode = md),
         nties(graphs[[g]], mode = md))
  }
}

## geodist --------------------------------------------------------------------
for (g in c("p4", "ring5", "disc7", "sparse50")) {
  gd <- geodist(graphs[[g]])
  snap(sprintf("geodist/%s/default", g), "geodist", g, opts(),
       list(gdist = gd$gdist, counts = gd$counts))
}
for (g in c("wtri", "valued20")) {
  gd <- geodist(graphs[[g]], ignore.eval = FALSE)
  snap(sprintf("geodist/%s/weighted", g), "geodist", g, opts(ignoreEval = FALSE),
       list(gdist = gd$gdist, counts = gd$counts))
}

## path centralities ----------------------------------------------------------
for (g in c("p4", "star5sym", "k23")) {
  snap(sprintf("betweenness/%s/graph", g), "betweenness", g, opts(mode = "graph"),
       betweenness(graphs[[g]], gmode = "graph"))
}
for (g in c("ring5", "t030", "sparse50")) {
  snap(sprintf("betweenness/%s/digraph", g), "betweenness", g, opts(mode = "digraph"),
       betweenness(graphs[[g]], gmode = "digraph"))
}
snap("betweenness/sparse50/undirected-cmode", "betweenness", "sparse50",
     opts(mode = "digraph", cmode = "undirected"),
     betweenness(graphs$sparse50, gmode = "digraph", cmode = "undirected"))
snap("betweenness/wtri/weighted", "betweenness", "wtri",
     opts(mode = "graph", ignoreEval = FALSE),
     betweenness(graphs$wtri, gmode = "graph", ignore.eval = FALSE))
snap("betweenness/p4/tmaxdev", "betweenness", "p4",
     opts(mode = "graph", tmaxdev = TRUE),
     betweenness(graphs$p4, gmode = "graph", tmaxdev = TRUE))

for (g in c("p4", "star5sym")) {
  snap(sprintf("closeness/%s/graph", g), "closeness", g, opts(mode = "graph"),
       closeness(graphs[[g]], gmode = "graph"))
}
for (cm in c("directed", "undirected", "suminvdir", "suminvundir", "gil-schmidt")) {
  snap(sprintf("closeness/sparse50/%s", cm), "closeness", "sparse50",
       opts(mode = "digraph", cmode = cm),
       closeness(graphs$sparse50, gmode = "digraph", cmode = cm))
}
snap("closeness/t030/undirected", "closeness", "t030",
     opts(mode = "digraph", cmode = "undirected"),
     closeness(graphs$t030, gmode = "digraph", cmode = "undirected"))

for (g in c("p4", "sparse50")) {
  snap(sprintf("stresscent/%s/digraph", g), "stresscent", g, opts(mode = "digraph"),
       stresscent(graphs[[g]], gmode = "digraph"))
  snap(sprintf("loadcent/%s/digraph", g), "loadcent", g, opts(mode = "digraph"),
       loadcent(graphs[[g]], gmode = "digraph"))
}
snap("stresscent/p4/graph", "stresscent", "p4", opts(mode = "graph"),
     stresscent(graphs$p4, gmode = "graph"))

snap("graphcent/p4/graph", "graphcent", "p4", opts(mode = "graph"),
     graphcent(graphs$p4, gmode = "graph"))
snap("graphcent/sparse50/digraph", "graphcent", "sparse50", opts(mode = "digraph"),
     graphcent(graphs$sparse50, gmode = "digraph"))

## eigenvector-family ---------------------------------------------------------
# Eigenvector sign is arbitrary (LAPACK convention); canonicalize like sna.js
# does, flipping so the largest-magnitude entry is positive.
canonical_sign <- function(v) {
  s <- sign(v[which.max(abs(v))])
  if (s == 0) v else v * s
}
for (g in c("p4", "star5sym", "k23", "paw4")) {
  snap(sprintf("evcent/%s/eigen", g), "evcent", g, opts(mode = "graph", useEigen = TRUE),
       canonical_sign(evcent(graphs[[g]], gmode = "graph", use.eigen = TRUE)))
}
# Power-method parity only where the iteration genuinely converges: the paw
# graph is connected and non-bipartite, so the dominant eigenvalue is unique.
# (On bipartite graphs like stars R's power method returns a non-converged
# vector with a warning; sna.js falls back to the dense eigen solver there.)
snap("evcent/paw4/power", "evcent", "paw4", opts(mode = "graph"),
     evcent(graphs$paw4, gmode = "graph"))

for (g in c("p4", "star5sym")) {
  snap(sprintf("bonpow/%s/graph", g), "bonpow", g, opts(mode = "graph"),
       bonpow(graphs[[g]], gmode = "graph"))
  snap(sprintf("infocent/%s/graph", g), "infocent", g, opts(mode = "graph"),
       infocent(graphs[[g]], gmode = "graph"))
}

snap("prestige/sparse50/indegree", "prestige", "sparse50",
     opts(mode = "digraph", cmode = "indegree"),
     prestige(graphs$sparse50, gmode = "digraph", cmode = "indegree"))
snap("prestige/star5out/indegree", "prestige", "star5out",
     opts(mode = "digraph", cmode = "indegree"),
     prestige(graphs$star5out, gmode = "digraph", cmode = "indegree"))

for (g in c("p4", "sparse50")) {
  snap(sprintf("gilschmidt/%s/digraph", g), "gilschmidt", g, opts(mode = "digraph"),
       gilschmidt(graphs[[g]], gmode = "digraph"))
}

snap("flowbet/p4/graph", "flowbet", "p4", opts(mode = "graph"),
     flowbet(graphs$p4, gmode = "graph"))
snap("flowbet/ring5/digraph", "flowbet", "ring5", opts(mode = "digraph"),
     flowbet(graphs$ring5, gmode = "digraph"))

## dyad/triad census and graph statistics -------------------------------------
for (g in c("ring5", "t030", "asym3", "sparse50", "na20")) {
  dc <- dyad.census(graphs[[g]])
  snap(sprintf("dyadCensus/%s/digraph", g), "dyadCensus", g, opts(mode = "digraph"),
       list(mut = dc[1, "Mut"], asym = dc[1, "Asym"], null = dc[1, "Null"]))
}
for (g in c("t030", "ring5", "sparse50")) {
  tc <- triad.census(graphs[[g]], mode = "digraph")
  snap(sprintf("triadCensus/%s/digraph", g), "triadCensus", g, opts(mode = "digraph"),
       as.list(setNames(as.vector(tc), colnames(tc))))
}
for (g in c("p4", "k23")) {
  tc <- triad.census(graphs[[g]], mode = "graph")
  snap(sprintf("triadCensus/%s/graph", g), "triadCensus", g, opts(mode = "graph"),
       as.list(setNames(as.vector(tc), colnames(tc))))
}

for (g in c("ring5", "sparse50", "asym3")) {
  for (msr in c("dyadic", "dyadic.nonnull", "edgewise")) {
    snap(sprintf("grecip/%s/%s", g, msr), "grecip", g, opts(mode = "digraph", measure = msr),
         grecip(graphs[[g]], measure = msr))
  }
  snap(sprintf("mutuality/%s", g), "mutuality", g, opts(mode = "digraph"),
       mutuality(graphs[[g]]))
}

for (g in c("t030", "sparse50", "p4")) {
  for (msr in c("weak", "strong", "weakcensus", "strongcensus")) {
    snap(sprintf("gtrans/%s/%s", g, msr), "gtrans", g, opts(mode = "digraph", measure = msr),
         gtrans(graphs[[g]], mode = "digraph", measure = msr))
  }
}

for (g in c("t030", "sparse50", "disc7")) {
  snap(sprintf("connectedness/%s", g), "connectedness", g, opts(mode = "digraph"),
       connectedness(graphs[[g]]))
  snap(sprintf("efficiency/%s", g), "efficiency", g, opts(mode = "digraph"),
       efficiency(graphs[[g]]))
  snap(sprintf("lubness/%s", g), "lubness", g, opts(mode = "digraph"),
       lubness(graphs[[g]]))
  for (msr in c("reciprocity", "krackhardt")) {
    snap(sprintf("hierarchy/%s/%s", g, msr), "hierarchy", g, opts(mode = "digraph", measure = msr),
         hierarchy(graphs[[g]], measure = msr))
  }
}

## components / connectivity ---------------------------------------------------
for (g in c("disc7", "sparse50", "iso5")) {
  for (conn in c("weak", "strong")) {
    cd <- component.dist(graphs[[g]], connected = conn)
    snap(sprintf("componentDist/%s/%s", g, conn), "componentDist", g,
         opts(mode = "digraph", connected = conn),
         list(csize_sorted = sort(as.vector(cd$csize), decreasing = TRUE),
              count = length(cd$csize), cdist = as.vector(cd$cdist)))
  }
  snap(sprintf("components/%s/weak", g), "components", g,
       opts(mode = "digraph", connected = "weak"),
       components(graphs[[g]], connected = "weak"))
}
for (g in c("disc7", "sparse50")) {
  snap(sprintf("reachability/%s", g), "reachability", g, opts(mode = "digraph"),
       reachability(graphs[[g]]))
}
snap("isolates/iso5", "isolates", "iso5", opts(mode = "graph"),
     isolates(graphs$iso5) - 1)  # 0-based for JS

## structural -----------------------------------------------------------------
for (g in c("p4", "sparse50")) {
  snap(sprintf("kcores/%s/digraph", g), "kcores", g, opts(mode = "digraph"),
       kcores(graphs[[g]]))
}

## symmetrize (matrix form) ----------------------------------------------------
for (g in c("asym3", "valued20", "t030")) {
  for (rule in c("weak", "strong", "upper", "lower")) {
    snap(sprintf("symmetrize/%s/%s", g, rule), "symmetrize", g, opts(rule = rule),
         symmetrize(graphs[[g]], rule = rule))
  }
}

## centralization --------------------------------------------------------------
snap("centralization/star5out/degree", "centralization", "star5out",
     opts(mode = "digraph", measure = "degree"),
     centralization(graphs$star5out, degree, mode = "digraph"))
snap("centralization/star5sym/degree-graph", "centralization", "star5sym",
     opts(mode = "graph", measure = "degree"),
     centralization(graphs$star5sym, degree, mode = "graph"))
snap("centralization/star5sym/betweenness-graph", "centralization", "star5sym",
     opts(mode = "graph", measure = "betweenness"),
     centralization(graphs$star5sym, betweenness, mode = "graph"))
snap("centralization/star5sym/closeness-graph", "centralization", "star5sym",
     opts(mode = "graph", measure = "closeness"),
     centralization(graphs$star5sym, closeness, mode = "graph"))

## statistical models -----------------------------------------------------------
## netlm / netlogit with nullhyp="classical" are deterministic (OLS / IRLS);
## inputs are generated once here and stored in the fixture so both sides fit
## exactly the same data.
set.seed(1001)
nm <- 12
mx1 <- matrix(runif(nm * nm), nm, nm); diag(mx1) <- 0
mx2 <- rgraph(nm, tprob = 0.3)
mnoise <- matrix(rnorm(nm * nm, 0, 0.5), nm, nm)
my <- 3 + 2 * mx1 - 1.5 * mx2 + mnoise; diag(my) <- 0

fit_lm <- netlm(my, list(mx1, mx2), nullhyp = "classical")
snap("netlm/classical", "netlm", NA,
     opts(nullhyp = "classical", mode = "digraph"),
     list(coefficients = fit_lm$coefficients, tstat = fit_lm$tstat,
          pGreaterEqualAbs = fit_lm$pgreqabs, rank = fit_lm$rank,
          n = fit_lm$n, dfResidual = fit_lm$df.residual),
     data = list(y = my, x1 = mx1, x2 = mx2))

set.seed(1002)
meta <- -1 + 2.5 * mx1 - 2 * mx2
mpy <- 1 / (1 + exp(-meta))
myb <- matrix(rbinom(nm * nm, 1, as.vector(mpy)), nm, nm); diag(myb) <- 0
fit_lg <- netlogit(myb, list(mx1, mx2), nullhyp = "classical")
snap("netlogit/classical", "netlogit", NA,
     opts(nullhyp = "classical", mode = "digraph"),
     list(coefficients = fit_lg$coefficients, se = fit_lg$se,
          tstat = fit_lg$tstat, deviance = fit_lg$deviance,
          nullDeviance = fit_lg$null.deviance, dfNull = fit_lg$df.null,
          dfResidual = fit_lg$df.residual),
     data = list(y = myb, x1 = mx1, x2 = mx2))

## lnam: R optimizes with BFGS, sna.js with Nelder-Mead; point estimates are
## compared at a looser tolerance in the parity runner.
set.seed(1003)
nl <- 30
mW <- matrix(0, nl, nl)
for (i in 1:nl) { mW[i, (i %% nl) + 1] <- 1; mW[i, ((i + nl - 2) %% nl) + 1] <- 1 }
mW <- mW / rowSums(mW)
mxl <- cbind(rnorm(nl), runif(nl))
myl <- as.vector(solve(diag(nl) - 0.35 * mW) %*% (mxl %*% c(1.5, -2) + rnorm(nl, 0, 0.8)))
fit_ln <- lnam(myl, mxl, W1 = mW)
# lnam returns 1-column matrices for several fields; flatten to vectors.
snap("lnam/x-w1", "lnam", NA, opts(),
     list(beta = as.vector(fit_ln$beta), betaSe = as.vector(fit_ln$beta.se),
          rho1 = as.vector(fit_ln$rho1), rho1Se = as.vector(fit_ln$rho1.se),
          sigma = as.vector(fit_ln$sigma), lnlikModel = as.vector(fit_ln$lnlik.model)),
     data = list(y = myl, x = mxl, W1 = mW))

## bbnam.fixed with outmode="posterior" is a closed-form posterior: exact parity.
set.seed(1004)
btruth <- rgraph(8, tprob = 0.3)
breports <- array(dim = c(3, 8, 8))
for (k in 1:3) {
  flip <- matrix(runif(64), 8, 8)
  obs <- btruth
  obs[btruth == 1 & flip < 0.2] <- 0
  obs[btruth == 0 & flip < 0.1] <- 1
  diag(obs) <- 0
  breports[k, , ] <- obs
}
bpost <- bbnam.fixed(breports, nprior = 0.5, em = 0.2, ep = 0.1, outmode = "posterior")
snap("bbnamFixed/posterior", "bbnamFixed", NA,
     opts(nprior = 0.5, em = 0.2, ep = 0.1, outmode = "posterior"),
     bpost,
     data = list(r1 = breports[1, , ], r2 = breports[2, , ], r3 = breports[3, , ]))

## ----------------------------------------------------------------- output ----
fixture <- list(
  provenance = list(
    generator = "scripts/generate-r-snapshots.R",
    rVersion = R.version.string,
    snaVersion = as.character(packageVersion("sna")),
    generated = format(Sys.time(), tz = "UTC", usetz = TRUE),
    corpusSeeds = list(sparse50 = 42, valued20 = 7, na20 = 9)
  ),
  graphs = lapply(graphs, function(m) sanitize(m)),
  cases = cases
)

json <- toJSON(fixture, auto_unbox = TRUE, digits = NA, null = "null", na = "null")
writeLines(json, file.path(out_dir, "parity.json"))

cat(sprintf("wrote %d cases to %s\n", length(cases), file.path(out_dir, "parity.json")))
if (length(skipped) > 0) {
  cat("SKIPPED:\n")
  for (s in skipped) cat(" -", s, "\n")
}
