# MBSE Vocabulary Demo: "Validated by whom?"

**Length:** about 20 minutes. **Audience:** systems engineers, test engineers and modeling & simulation analysts.
All commands below are run from the repository folder (`stardog-vocab-library`).

---

## The story in one minute (read this first)

A small engineering program is building **FSS-1, a solar-powered Field Sensor Station**. Three teams work on it:

| Team | What they do |
|---|---|
| **Systems Engineering** | Owns the system model and the requirements |
| **Test & Evaluation** | Plans and runs lab and field tests |
| **Modeling & Simulation** | Builds computer simulations |

Requirement **REQ-001** says: *"The station shall operate for 72 hours with no sun at −20 °C."*
Nobody can leave a station in the dark for three days in a freezer, so REQ-001 was **verified by analysis**, using the **Battery discharge simulation v2**.

At the design review, the test lead said: *"The battery analysis was validated."*

- The **Systems Engineering** team heard: *the system meets the users' needs.*
- The **Modeling & Simulation** team heard: *the simulation was compared against real experimental data.* (It wasn't. There is no validation evidence.)
- What the **Test & Evaluation** team actually meant: *we dry-ran the test procedure and it works.*

**Same word, three meanings, one risky requirement.** Nobody lied, and nobody was wrong in their own team's language.

**What this demo shows:** Stardog doesn't force one definition on everybody. It keeps each team's own words, records **how** they relate, makes changes go through **review**, and keeps an **audit trail**. Because it's all in the knowledge graph, anyone (or Voicebox) can ask: *"Which requirements rest on a simulation nobody has validated?"*

---

## Before the demo (do this 10 minutes ahead)

You need: a running local Stardog on `localhost:5820`, set up for this app as in the main [README](../../README.md), and Node.js. The reset script uses the `admin` account (password `admin` unless you set `STARDOG_ADMIN_USER` / `STARDOG_ADMIN_PASSWORD`). Part 9 also needs a local Stardog Voicebox on `localhost:8000`.

1. **Open the Terminal app.**
2. **Start the app**, if it isn't already running. Type this and press **Enter**:
   ```
   cd stardog-vocab-library && npm run dev
   ```
   Leave that window open. (If it says the port is already in use, the app is already running. That's fine.)
3. **Open a second Terminal window** (press **⌘ N**).
4. **Reset the demo database.** This wipes the last demo and starts fresh. Type this and press **Enter**:
   ```
   cd stardog-vocab-library && demos/mbse/setup-mbse-demo.sh
   ```
   ✅ You should see, within a few seconds:
   `✓ vocab_mbse_demo ready (444 triples).`
   ❌ If you see `FAILED` or `Connection refused`, Stardog isn't running or the admin password is different. Start Stardog (for Docker: open Docker Desktop and wait a minute) and try again.
5. **Open Chrome** and go to **http://localhost:5180**
6. If the app opens on a page that is **already connected** to another database, click **Disconnect** at the very bottom of the left side.
7. Make the browser window **full screen** and zoom so the text is easy to read from the back of the room (**⌘ +** or **⌘ −**).

> **Tip:** Run step 4 again before every new audience. It always gives you a clean starting point.

---

## Part 1: Connect (1 minute)

On the **"Vocabulary Governance"** connection screen:

1. **Stardog Endpoint:** leave it as `/stardog`.
2. **Database:** click the drop-down and pick **vocab_mbse_demo**.
3. **Sign in as a Stardog user:** leave both boxes **empty**.
4. **Or paste a Bearer token:** leave it **empty**.
5. **Your Name (for audit trail):** type your name, for example `Alex Rivera`.
6. Click the big blue **Connect & Load Ontology** button.

✅ You should see the **Vocabulary Explorer**. The left column lists four headings: **DIGITAL THREAD**, **MODELING AND SIMULATION**, **SYSTEMS ENGINEERING**, **TEST AND EVALUATION**.

🗣️ **Say:** *"This is one Stardog database. It holds each team's own vocabulary, plus the program's digital thread. Nothing has been changed yet; connecting only reads."*

---

## Part 2: The digital thread (3 minutes)

1. In the far-left menu, under **EXPLORE**, click **Graph View**.

   ✅ In the middle of the screen you see a chain of circles connected by arrows:
   **System → Component → Requirement → Verification Activity → Simulation Model → Validation Evidence**, and **Interface** connected to **Component**.
   (Some loose circles float around the edges. Those are the teams' word lists; ignore them.)

   🗣️ **Say:** *"This is the shape of the program's engineering data: a system has components, components satisfy requirements, requirements are verified by activities, and an analysis can use a simulation model, which should be validated by evidence."*

2. In the far-left menu, click **Vocabulary Explorer**.
3. In the list, under **DIGITAL THREAD → CLASSES**, click **Requirement**.

   ✅ The right side shows **Requirement**, with **INSTANCES 4**, a **Properties** table, and a **SHACL Constraints** table (for example: *requirement ID* must match `^REQ-[0-9]{3}$`).

   🗣️ **Say:** *"Four real requirements use this definition, and Stardog holds the data-quality rules for them: every requirement needs an ID and at least one way it is verified."*

4. Click the **Impact** tab (next to Overview and Governance).

   ✅ A red **High Impact** box: **6 dependencies detected**, **4 instances**.

   🗣️ **Say:** *"Before anyone renames or retires 'Requirement', they see what would break: properties, a SHACL shape and real data."*

---

## Part 3: The problem, the same word with three meanings (3 minutes)

1. In the far-left menu, under **COMMUNITIES**, click **Shared Terms**.

   ✅ The top of the list says **5 labels used by more than one group**: interface, model, validation, verification, fidelity.

2. Click **validation**.

   ✅ Three cards appear side by side:
   - **SYSTEMS ENGINEERING**: "Confirming that the finished system meets the users' real needs… did we build the right thing?"
   - **TEST & EVALUATION**: "Dry-running a test procedure and its equipment…"
   - **MODELING & SIMULATION**: "Measuring how accurately a simulation represents the real world… by comparing its results with experimental data."

   🗣️ **Say:** *"Here's our design review. Three teams said 'validated' and meant three different things. All three are correct in their own team. The goal is not to make two of them wrong; it's to make the difference visible."*

3. *(Optional)* Click **model** too: a SysML system model, a physical scale model for the wind tunnel, and a computer simulation.

---

## Part 4: Flag the risky simulation (3 minutes)

1. In the far-left menu, click **Vocabulary Explorer**.
2. Under **DIGITAL THREAD → CLASSES**, click **Simulation Model**.
3. Click the **Governance** tab.
4. Under **Lifecycle Status**, click the **Change** button, then click **Under Review**.

   ✅ The green **ACTIVE** badge turns into **UNDER REVIEW**.

5. Under **Stewardship**, click in the box that says *Steward name or email*, type `M&S lead analyst`, and click **Assign**.

   ✅ "M&S lead analyst / Term Steward" appears.

6. Under **Editorial Notes**, click in the box that says *Add a note...*, type
   `No validation evidence yet. Do not use as sole evidence for REQ-001.`
   and press **Enter**.

   ✅ The note appears with your name and today's date, and **Recent Activity** shows both changes.

🗣️ **Say:** *"Now anyone who looks up this class sees it's under review, who owns it, and why. That takes seconds, not a meeting."*

---

## Part 5: Record how the meanings relate (4 minutes)

### 5a. Validation (M&S) is *related to* validation (Systems Engineering)

1. In the far-left menu, click **Shared Terms**, then click **validation**.
2. Scroll down to **Propose a mapping**:
   - **Source term:** `validation — Modeling & Simulation`
   - **Relation:** `related match`
   - **Target term:** `validation — Systems Engineering`
   - **Justification (required):** type
     `A validated model is not a validated system. M&S compares a simulation with experimental data; Systems Engineering checks the finished system against user needs.`
3. Click **Propose mapping**.

   ✅ A message says: *"Proposed. It appears in the Review Queue and becomes a mapping once approved."* **Nothing in the data has changed yet.**

🗣️ **Say:** *"'Related match' means connected but **not interchangeable**. That is exactly the warning we needed at the design review."*

### 5b. A similar wording: TPM and MOP

1. Still in **Shared Terms**, scroll the left list down to **similar wordings**.
2. Click **technical performance measure ↔ measure of performance** (it shows **67%**).

   ✅ Systems Engineering's **TPM** and Test & Evaluation's **MOP** appear side by side.

3. In **Propose a mapping**:
   - **Source term:** `technical performance measure — Systems Engineering`
   - **Relation:** `close match`
   - **Target term:** `measure of performance — Test & Evaluation`
   - **Justification:** `The test team measures the MOP; that measured value shows whether the design TPM is on track.`
4. Click **Propose mapping**.

🗣️ **Say:** *"The tool noticed these two terms are worded alike. A person decides how they relate. Matching here is by wording only; it doesn't guess meaning."*

---

## Part 6: Fix the confusing label through review (2 minutes)

1. In the far-left menu, under **GOVERN**, click **Review Queue**.
2. Click **New Proposal** (top right).
3. In the window that opens:
   - **Type:** pick **Modify term**
   - **Target Term:** pick `validation — Test & Evaluation`
   - **New label (optional):** type `test procedure validation`
   - **Title:** type `Rename T&E "validation" to "test procedure validation"`
   - **Description:** type `At the design review, "the battery analysis was validated" was heard as model validation. The T&E meaning is a dry run of the test procedure.`
4. Click **Submit Proposal**.

   ✅ The Review Queue now says **3 pending proposals**.

🗣️ **Say:** *"Test & Evaluation keeps its meaning. Only the label becomes unambiguous, and that change has to be approved."*

---

## Part 7: Approve the changes (2 minutes)

For **each** of the three cards under **PENDING REVIEW**:

1. Click **Review** (on the right of the card).
2. In *Review comment...*, type `Agreed at the FSS-1 vocabulary review.`
3. Click the green **Approve** button.

✅ After all three, the page says **0 pending proposals**, and each card under **RESOLVED** shows **APPROVED** and **APPLIED**.

🗣️ **Say:** *"Approving applied each change to Stardog in the same step as its audit record. Either both are saved or neither is."*

---

## Part 8: Show the results (3 minutes)

1. **Shared Terms** → **validation** now says **2** groups. Test & Evaluation's term is now "test procedure validation".
2. **Mappings** (under COMMUNITIES): two **APPROVED** rows with your justification and your name as reviewer, plus one **ASSERTED** row (fidelity ↔ fidelity), which was already in the M&S team's own data and never reviewed.
3. **Audit Log** (under GOVERN): **9 entries**, every step you took, newest first: steward assigned, note added, proposals created, proposals approved. Use the drop-down at the top to show just one kind.
4. **Analytics** (under ANALYZE): **Terms by Lifecycle Status** now shows **UnderReview: 1** next to the Active terms, and **Stewardship** went from 0% to 3% (one term of 39 has a steward). *Say: "That's the to-do list for the next review."*

🗣️ **Say:** *"Six months from now, when someone asks why REQ-001's evidence was flagged, the answer is right here: who, when and why."*

---

## Part 9 (optional, 2 minutes): Ask the knowledge graph in plain English

This uses **Stardog Voicebox** from the Terminal. Each answer takes 10 to 60 seconds.

1. Go to the second Terminal window.
2. Type each line below and press **Enter**, then wait for the answer.

```
demos/mbse/ask-voicebox.sh "Which requirements are verified by an analysis that uses a simulation model, and does that simulation model have any validation evidence?"
```
✅ Expected: REQ-001 (72 hours without sun) is verified by an analysis using **Battery discharge simulation v2**, and the model has **no validation evidence**.

```
demos/mbse/ask-voicebox.sh "What does 'validation' mean in each group?"
```
✅ Expected: three meanings, with Test & Evaluation's now called **test procedure validation** (the change you just approved).

```
demos/mbse/ask-voicebox.sh "How is the Modeling & Simulation term 'validation' mapped to other groups, who approved it, and why?"
```
✅ Expected: a **related match** to Systems Engineering's validation, approved by the name you typed, with your justification.

🗣️ **Say:** *"Nothing was re-indexed or re-trained. Voicebox reads the same governed graph, so the approvals from two minutes ago are already in its answers."*

*(Voicebox writes its own answers, so the wording changes a little from run to run; the facts shouldn't.)*

---

## Closing line

> *"Model-based systems engineering only works if the words in the model mean the same thing to everyone who relies on it. This keeps each team's language and makes the connections explicit, reviewed and auditable, and every tool connected to Stardog can query them."*

---

## If something goes wrong

| What you see | What to do |
|---|---|
| The **Database** list doesn't include `vocab_mbse_demo` | Run the reset command (Before the demo, step 4), then reload the page (**⌘ R**). |
| "Stardog refused this change" or "My save failed" | The app's shared account can't write to this database. Run the reset command again; it re-grants access to `vocab_app` if you use the secured setup (`scripts/setup-secured-demo.sh`). Otherwise give the account in your `.env` write access to `vocab_mbse_demo`. |
| The page is blank or stuck | Reload (**⌘ R**). The app remembers where you were. |
| You clicked the wrong thing during a proposal | Click **Cancel** and start the proposal again. Approved changes can't be undone; reset the database before the next demo. |
| Graph View looks like scattered dots | Scroll to zoom out, or drag the background. The chain of connected circles is near the middle. |
| Voicebox says it can't find anything | Run the reset command, then repeat Parts 5 to 7 before asking (or ask only the first question, which needs no approvals). |
| The app isn't at http://localhost:5180 | Start it again (Before the demo, step 2). |

## What's in this folder

| File | What it is |
|---|---|
| `README.md` | This guide |
| `setup-mbse-demo.sh` | Builds or resets the `vocab_mbse_demo` database (about 5 seconds) |
| `mbse-vocabulary.trig` | The demo data: three teams' vocabularies, the digital-thread model with SHACL rules, and the FSS-1 program data |
| `mbse-voicebox-schema.ttl` | Tells Voicebox about the digital-thread classes |
| `ask-voicebox.sh` | Asks Voicebox a question from the Terminal |
