import { describe, expect, it } from "vitest";
import type { RunResponse } from "../types/api";
import rrRandom from "./fixtures/run-bcg-rr-random.json";
import {
  forestDomain,
  forestRows,
  labelsToSend,
  num,
  pooled,
  pText,
  qnorm,
  ratioTicks,
  sourceText,
  varianceText,
  zFor,
} from "./numbers";

// The fixtures are the backend's real answers to /run for the BCG trials (metadat's dat.bcg), with R 4.5 and
// metafor 5.0.1: run-bcg-rr-random.json is the risk ratio with random effects (REML, Wald, 95%).
const RR = rrRandom as unknown as RunResponse;

describe("qnorm", () => {
  it("gives R's qnorm() to 1e-12", () => {
    // R: qnorm(c(0.975, 0.95, 0.5, 0.001, 0.9999))
    expect(qnorm(0.975)).toBeCloseTo(1.959963984540054, 12);
    expect(qnorm(0.95)).toBeCloseTo(1.644853626951472, 12);
    expect(qnorm(0.5)).toBeCloseTo(0, 12);
    expect(qnorm(0.001)).toBeCloseTo(-3.090232306167813, 12);
    expect(qnorm(0.9999)).toBeCloseTo(3.719016485455708, 12);
    // R: qnorm(1e-300), the tail beyond r = 5
    expect(qnorm(1e-300)).toBeCloseTo(-37.0470962993612, 10);
    expect(qnorm(0)).toBeNaN();
    expect(zFor(95)).toBeCloseTo(1.959963984540054, 12);
  });
});

describe("forestRows", () => {
  it("gives each study the interval of metafor's summary() of escalc()", () => {
    // R, metafor 5.0.1: summary(escalc("RR", ai=tpos, bi=tneg, ci=cpos, di=cneg, data=dat.bcg[1:2,]), level=90)
    //   yi -0.88931133392, vi 0.325584765004, ci.lb -1.82786539721, ci.ub 0.0492427293653
    //   yi -1.58538865720, vi 0.194581121398, ci.lb -2.31095580040, ci.ub -0.8598215140029
    const at90 = { ...RR, options: { ...RR.options, level: 90 }, studies: RR.studies.slice(0, 2) };
    const rows = forestRows(at90);
    expect(rows.map((r) => r.study)).toEqual(["Aronson 1948", "Ferguson & Simes 1949"]);
    const [a, b] = rows;
    expect(Math.log(a?.estimate ?? NaN)).toBeCloseTo(-0.88931133392, 9);
    expect(Math.log(a?.lower ?? NaN)).toBeCloseTo(-1.82786539721, 8);
    expect(Math.log(a?.upper ?? NaN)).toBeCloseTo(0.0492427293653, 8);
    expect(Math.log(b?.lower ?? NaN)).toBeCloseTo(-2.3109558004, 8);
    expect(Math.log(b?.upper ?? NaN)).toBeCloseTo(-0.8598215140029, 8);
  });

  it("leaves out studies the model didn't use, and keeps differences on their own scale", () => {
    const studies = [
      { study: "A", yi: -0.1, vi: 0.01, weight: 60, used: true },
      { study: "Zero", yi: null, vi: null, weight: null, used: false },
    ];
    const rows = forestRows({ ...RR, pathway: { ...RR.pathway, metric: "RD" }, studies });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.estimate).toBe(-0.1);
    expect(rows[0]?.lower).toBeCloseTo(-0.1 - 1.959963984540054 * 0.1, 10);
  });
});

describe("pooled", () => {
  it("reads ratios back-transformed, as /run gives them", () => {
    const p = pooled(RR);
    expect(p.estimate).toBeCloseTo(0.4894, 4);
    expect(num(p.lower ?? NaN, 2)).toBe("0.34");
    expect(num(p.upper ?? NaN, 2)).toBe("0.70");
    expect(num(p.piLower ?? NaN, 2)).toBe("0.15");
    expect(num(p.piUpper ?? NaN, 2)).toBe("1.55");
  });

  it("reads differences as they are", () => {
    const rd = { ...RR, ratio_scale: null, summary: { ...RR.summary, estimate: -0.025 } };
    expect(pooled(rd).estimate).toBe(-0.025);
  });
});

describe("formatting", () => {
  it("writes numbers with a true minus sign, and never a negative zero", () => {
    expect(num(-0.7145, 3)).toBe("−0.715");
    expect(num(0.49, 2)).toBe("0.49");
    expect(num(-0.0001, 3)).toBe("0.000");
  });

  it("writes p, variances and sources as the page shows them", () => {
    expect(pText(0.00007)).toBe("p < 0.001");
    expect(pText(0.0201)).toBe("p = 0.020");
    expect(varianceText(0.3132433)).toBe("0.313");
    expect(varianceText(0)).toBe("0");
    expect(varianceText(0.00042)).toBe("0.00042");
    expect(
      sourceText([
        { key: "CH-6", section: "6.4.1.2" },
        { key: "CH-6", section: "6.4.1.3" },
        { key: "CH-10", section: "10.3.2" },
      ]),
    ).toBe("CH-6 s6.4.1.2, s6.4.1.3, CH-10 s10.3.2");
  });
});

describe("the forest plot's axis", () => {
  it("covers every interval and no effect, within the ratio limits", () => {
    const rows = forestRows(RR);
    const [lo, hi] = forestDomain("RR", rows, pooled(RR));
    expect(lo).toBeLessThan(0.1);
    expect(hi).toBeGreaterThan(6);
    const wide = forestDomain("RR", [{ study: "x", estimate: 1, lower: 0.0001, upper: 5000, weight: 100 }], pooled(RR));
    expect(wide).toEqual([0.01, 100]);
  });

  it("ticks a log axis at 1-2-5 values, thinned around 1 when the range is wide", () => {
    expect(ratioTicks([0.07, 6.6])).toEqual([0.1, 0.2, 0.5, 1, 2, 5]);
    expect(ratioTicks([0.01, 100])).toEqual([0.01, 0.05, 0.2, 1, 5, 20, 100]);
  });
});

describe("labelsToSend", () => {
  it("sends only the words typed, and nothing when none are", () => {
    expect(labelsToSend({ outcome: "  tuberculosis ", treatment: "", control: null })).toEqual({ outcome: "tuberculosis" });
    expect(labelsToSend({ outcome: " " })).toBeNull();
  });
});
