# Ascend — AI interview coach (Windows)

Ascend is a Duolingo-style desktop app that turns **Claude Code** into your personal
interview trainer. There is no pre-written course: Claude designs your roadmap, writes
every lesson, grades your answers, and adapts to what you know as you go.

It ships with two tracks, **Java & Spring Boot** and **Agentic AI**, each levelled
1 → 10. You can add any other subject: system design, DSA, Kafka, SQL, behavioral…

## What it does

| | |
|---|---|
| **Roadmaps (10 levels, then more)** | Claude designs 10 mandatory levels × 4–6 topics per track around your experience, target role and goals. Everyone starts at Level 1, and Level 1 is pitched at your self-assessed starting point ("Comfortable" skips what you already know). Once all 10 are done, Claude designs levels 11–13 (and so on) around what you've mastered. It can use web search to check current versions and trends. |
| **Lessons** | Each lesson opens with a short, textbook-style **primer** that streams in live and is written for your gaps. **Highlight any passage to ask Ace** to explain it, give an example, simplify it or show the interview angle. A **hands-on warm-up** follows (flashcards, worked examples revealed step by step, ungraded quick checks, sorting), then a mix of question types: **multiple choice, select-all, true/false, fill-in-the-blanks** (word bank or typed, including code), **short answer** (graded by Claude like an interviewer), **ordering** and **match pairs**. |
| **In the quiz** | Step back through earlier answers (← / Previous) without losing the current one, re-read the lesson in a side panel, and unlock a **hint** after a few seconds (hinted answers earn half XP and count less towards mastery). |
| **Adaptive engine** | Every answer updates per-topic *mastery* (an Elo-style score) and per-concept *strength*. The next lesson's difficulty, question mix, interleaved review questions and "recent mistakes" are chosen from this data. Wrong answers come back at the end of the lesson for a second try. |
| **Coach memory** | After each lesson Claude writes a debrief and saves durable observations ("confuses `@Transactional` propagation modes"). It can also **insert a remedial topic into your path** when it finds a gap. All of this is visible and editable on the Progress page. |
| **Spaced repetition** | Completed topics are scheduled for review (SM-2 style). Practice modes: Smart review, Weak spots, Fix my mistakes, Rapid fire, Custom drill. |
| **Company prep** | Paste a job description with the company, role and interview date. Claude researches the company on the web (tech stack, interview process, values, news), analyses the JD against your profile, and produces a skill-gap table, a day-by-day plan, likely questions with answer hints, and a **company-specific prep path**. |
| **Mock interviews** | A live Claude session plays the interviewer: technical, behavioral, system design, rapid fire or mixed; friendly, neutral or tough persona. It asks one question at a time, follows up, and then scores you like a hiring panel (verdict, dimensions, per-question feedback, ideal answers). |
| **AI coach chat** | A chat with web search and tools to read and update your learner profile. It can hand you one-click practice sessions. |
| **Gamification** | XP, streaks, daily goals, combos, achievements, confetti, sound effects. |
| **Model choice** | The model list comes live from your Claude Code account. There is a separate, faster model for grading and debriefs, plus a speed-vs-depth (effort) setting. |

## Install

Run **`dist\Ascend-Setup-1.0.0.exe`**. It installs per-user, with Start menu and desktop shortcuts.
To run without installing, use `dist\win-unpacked\Ascend.exe`. On first launch, onboarding checks your
Claude Code sign-in, asks about you, and designs your roadmaps (about 1–2 minutes).

> The installer isn't code-signed, so Windows SmartScreen may show "Windows protected your PC".
> Choose **More info → Run anyway**.

## Requirements

- Windows 10/11 (x64)
- **Claude Code sign-in** (Pro, Max, Team or Enterprise). Run `claude` in a terminal and use `/login`.
  You can also use an Anthropic API key in *Settings → Claude connection*.
- Node.js 20+ (only to build from source)

The Claude Agent SDK bundles its own native Claude Code binary, so no separate install is needed.
It shares your existing Claude Code login.

## Run it

```powershell
cd ascend-coach
npm install
npm run dev        # development with hot reload
npm run build      # typecheck + production bundles
npm run start      # run the production build
npm run dist       # build the Windows installer → dist\Ascend-Setup-1.0.0.exe
npm run dist:dir   # unpacked app → dist\win-unpacked\Ascend.exe
```

> `npm run dev` and `npm run start` clear `ELECTRON_RUN_AS_NODE` for you. Terminals opened
> by VS Code extensions set it, and it makes Electron start as plain Node. If you launch
> Electron directly and see `Cannot read properties of undefined (reading 'whenReady')`, run
> `Remove-Item Env:ELECTRON_RUN_AS_NODE` (PowerShell) or `unset ELECTRON_RUN_AS_NODE` (bash) first.

## How Claude Code is used

Everything AI-related runs through `@anthropic-ai/claude-agent-sdk` (`src/main/agent/runtime.ts`):

- **Isolated sessions**: `settingSources: []`, `strictMcpConfig`, and only the tools a task
  needs (`WebSearch`/`WebFetch` plus Ascend's own MCP tools). No Bash, no file access. Your personal
  `CLAUDE.md`, hooks and MCP servers are not loaded.
- **Structured output**: roadmaps, questions, grades, debriefs, company briefs,
  scorecards and insights use `outputFormat: json_schema`. Claude Code validates the output and
  retries until it matches (`src/main/agent/schemas.ts`), and the app then validates and repairs
  every question before showing it.
- **Streaming**: primers, chat and interviewer replies stream token by token. Tool use shows up
  as live activity ("Searching the web: …").
- **Live sessions**: mock interviews and coach chat keep one Claude Code process alive across
  turns (streaming input), and resume the session after idling or a restart.
- **Pre-warming**: a grader process starts while you type a short answer, so feedback is fast.
- **In-process MCP server** (`src/main/agent/coachTools.ts`): `get_learner_profile`,
  `get_topic_mastery`, `get_recent_mistakes`, `record_coach_note`, `suggest_practice`,
  `schedule_review`.

Prompts live in `src/main/agent/prompts.ts`. Tune them there.

## Project layout

```
src/
  shared/        types, IPC contract, constants, pure progress logic (used by both sides)
  main/          Electron main process
    agent/       Claude Agent SDK runtime, prompts, schemas, learner context, MCP tools
    engine/      mastery + spaced repetition, grading, XP/streaks/achievements, lesson planner
    services/    tracks, lessons, targets, interviews, chat, insights
    store.ts     local JSON persistence (atomic writes + daily backup)
    ipc.ts       typed RPC surface
  preload/       sandboxed bridge → window.ascend
  renderer/      React 19 + Tailwind 4 UI (features/learn, lesson, practice, interview, targets, coach, progress, settings)
```

## Your data

Everything is stored locally in `%APPDATA%\Ascend\data\ascend.json`, with a daily
`.bak`. An API key, if you use one, is encrypted with Windows DPAPI via Electron `safeStorage`
and is never exported. *Settings → Your data* has export, import and reset.
`ASCEND_USER_DATA=<folder>` runs the app against a separate profile, which is useful for testing.

## Troubleshooting

- **"Claude Code isn't signed in"**: run `claude`, then `/login`. After that, *Settings → Test*.
- **"Model isn't available"**: pick another model in *Settings → Models*. The list reflects your plan.
- **Usage limit reached**: the top bar and Settings show the reset time. Switch to a lighter
  model, or use *Speed vs depth → Faster*.
- **Want to use your own Claude Code install?** *Settings → Claude Code executable*, for example
  `C:\Users\you\.local\bin\claude.exe`.
