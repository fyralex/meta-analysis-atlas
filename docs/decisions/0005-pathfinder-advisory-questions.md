# 0005: Pathfinder's two advisory questions advise; they don't filter

Decided by the owner, 2026-11-17 (issue #7).

## Decision

After its four questions, Pathfinder asks two more, from issue #7. Neither one
removes a pathway, and neither adds text of its own. Everything it shows comes
from a card or a rule that already cites its source.

- **"Are the events rare?"**
  - **Yes or Not sure:** the results show what the cards of the fitting
    methods say about rare events, each line with its source. These are the
    inverse-variance caution, with rule R9 (Cochrane 10.4.4.3), and the "use"
    lines for Peto (10.4.2, 10.4.4.3), the GLMM (10.4.4.3), penalised
    logistic regression (`metabin()`) and network Mantel-Haenszel
    (`netmetabin()`).
  - **No:** shows nothing more.
  - **Which methods:** every method that fits the four answers, whichever
    model is shown, so Peto's line stays when random effects are pre-selected.
  - **When it is asked:** only for binary outcomes compared between two groups
    or across a network, with arm-level counts: the comparisons Cochrane
    10.4.4.3 (dichotomous outcomes) and `netmetabin()` speak to. It is also
    asked only where a fitting method's card has a "use" line about rare events.
    Rates (Cochrane 10.8) and one-group data are left out, although some of
    the same methods fit them. The inverse-variance caution alone doesn't
    trigger it, because inverse variance fits every outcome type.
- **"Do you expect the true effects to differ between studies?"**
  - **Yes or No:** "Yes" pre-selects random effects and "No" common effect.
    The other model is one click away, and "Show both models" brings back
    every pathway.
  - **Not sure:** pre-selects neither.
  - **What it shows:** the question and the results show both model cards:
    each model's first "what it is" line, its "use" line and its cautions. The
    "use" lines say Cochrane presents the choice as debated and advises against
    basing it on a test for heterogeneity (10.10.4.1).
  - **When it is asked:** only when both models still fit.

The answers are kept in the page address (`rare`, `vary`), next to the Atlas's
choices. Changing an earlier answer takes them back, and so does any change
made in the Atlas. "Open them in the Atlas" carries a pre-selected model.

## Why

- **Rare events:** filtering out inverse variance would turn Cochrane's advice
  into a rule the map doesn't hold. R9 is a caution, and the pathways stay
  valid.
- **Common versus random effects:** this is genuine methodological debate
  (CLAUDE.md, rule 8: present debate as debate). Pre-selecting follows the
  user's own expectation without hiding the alternative.

## Changing it

Making either question filter pathways would change what Pathfinder presents
as valid. That needs the owner's decision and an update to this record.
