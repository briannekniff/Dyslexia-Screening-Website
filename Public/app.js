const app = document.getElementById("app");

const WEBHOOK_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_URL_HERE";

const passages = {
  "1-3":
    "Liam likes to read with his teacher at school. He looks at each word and says it out loud. Sometimes he stops and tries again. Then he keeps going until he finishes the whole story. Reading every day helps him learn new words and feel more confident.",
  "4-6":
    "Reading helps students understand stories, directions, and new ideas. Some readers move smoothly from word to word, while others need more time to stop, think, and try again. With support and practice, students can strengthen their reading skills and build confidence over time.",
  "7-9":
    "Reading involves visual tracking, language processing, memory, and attention. Some students read fluently across each line, while others pause more often, return to earlier words, or lose their place. Noticing these patterns earlier can help students access support before frustration grows.",
  "10-12":
    "Reading is a complex task that depends on coordinated eye movements, decoding, language comprehension, and sustained attention. When a student shows repeated regressions, longer fixations, or unstable progression through text, those patterns may suggest a need for further screening and targeted educational support."
};

const gradeDetails = {
  "1-3": {
    title: "Grades 1–3",
    description: "Shorter and simpler reading passage for early readers."
  },
  "4-6": {
    title: "Grades 4–6",
    description: "A moderate reading passage for middle elementary levels."
  },
  "7-9": {
    title: "Grades 7–9",
    description: "A more advanced passage for intermediate readers."
  },
  "10-12": {
    title: "Grades 10–12",
    description: "A more complex reading passage for older students."
  }
};

const questions = [
  ["lostPlace", "Did you lose your place while reading?"],
  ["reread", "Did you reread words or lines?"],
  ["difficult", "Did the reading feel difficult?"],
  ["wordsMoving", "Did any words appear blurry or like they were moving?"],
  ["frustrated", "Did you feel frustrated while reading?"],
  ["tooHard", "Did the paragraph feel too hard for your level?"]
];

const state = {
  screen: "permission",
  permissionsGranted: false,
  gradeBand: "",
  readingStarted: false,
  startTime: null,
  elapsedSec: 0,
  timerId: null,
  finalScore: 0,
  finalLevel: "",
  participantId: "",
  webgazerStarted: false,
  answers: {
    lostPlace: null,
    reread: null,
    difficult: null,
    wordsMoving: null,
    frustrated: null,
    tooHard: null
  },
  gaze: {
    samples: 0,
    regressions: 0,
    lineJumps: 0,
    fixations: 0,
    lastX: null,
    lastY: null,
    stillCount: 0
  }
};

function resetAnswers() {
  state.answers = {
    lostPlace: null,
    reread: null,
    difficult: null,
    wordsMoving: null,
    frustrated: null,
    tooHard: null
  };
}

function stopReadingTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function resetReadingData() {
  stopReadingTimer();
  state.readingStarted = false;
  state.startTime = null;
  state.elapsedSec = 0;
  state.gaze = {
    samples: 0,
    regressions: 0,
    lineJumps: 0,
    fixations: 0,
    lastX: null,
    lastY: null,
    stillCount: 0
  };
}

function formatTime(seconds) {
  return `${seconds.toFixed(1)} s`;
}

function getProgressPercent() {
  const map = {
    permission: 10,
    intro: 25,
    importance: 40,
    grade: 55,
    instructions: 70,
    reading: 82,
    questions: 92,
    results: 100,
    thanks: 100
  };

  return map[state.screen] || 10;
}

function progressMarkup() {
  const pct = getProgressPercent();
  return `
    <div class="progress-wrap">
      <div class="progress-top">
        <span>Screening Progress</span>
        <span>${pct}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
    </div>
  `;
}

function setScreen(screen) {
  if (screen !== "reading") {
    stopReadingTimer();
  }

  state.screen = screen;
  render();
}

async function requestPermissions() {
  try {
    await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    state.permissionsGranted = true;
    setScreen("intro");
  } catch (error) {
    alert("Camera and microphone access are required to continue.");
  }
}

function chooseGrade(grade) {
  state.gradeBand = grade;
  resetAnswers();
  resetReadingData();
  setScreen("instructions");
}

function startWebGazerIfNeeded() {
  if (!window.webgazer || state.webgazerStarted) return;

  try {
    window.webgazer
      .setRegression("ridge")
      .setGazeListener((data) => {
        if (!data || state.screen !== "reading" || !state.readingStarted) return;

        const x = data.x;
        const y = data.y;

        state.gaze.samples += 1;

        if (state.gaze.lastX !== null && state.gaze.lastY !== null) {
          const dx = x - state.gaze.lastX;
          const dy = y - state.gaze.lastY;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 20) {
            state.gaze.stillCount += 1;
            if (state.gaze.stillCount === 8) {
              state.gaze.fixations += 1;
            }
          } else {
            state.gaze.stillCount = 0;
          }

          if (dx < -35) {
            state.gaze.regressions += 1;
          }

          if (Math.abs(dy) > 35) {
            state.gaze.lineJumps += 1;
          }
        }

        state.gaze.lastX = x;
        state.gaze.lastY = y;
      })
      .begin();

    window.webgazer
      .showVideoPreview(false)
      .showFaceOverlay(false)
      .showFaceFeedbackBox(false);

    state.webgazerStarted = true;
  } catch (error) {
    console.warn("WebGazer failed to start:", error);
  }
}

function goToReadingScreen() {
  resetReadingData();
  startWebGazerIfNeeded();
  setScreen("reading");
}

function startReading() {
  if (state.readingStarted) return;

  state.readingStarted = true;
  state.startTime = Date.now();
  state.elapsedSec = 0;

  const timerValue = document.getElementById("timerValue");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");

  if (startBtn) startBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = false;

  stopReadingTimer();

  state.timerId = setInterval(() => {
    state.elapsedSec = (Date.now() - state.startTime) / 1000;
    if (timerValue) {
      timerValue.textContent = formatTime(state.elapsedSec);
    }
  }, 100);
}

function stopReading() {
  if (!state.readingStarted) return;

  state.readingStarted = false;
  stopReadingTimer();

  if (state.startTime) {
    state.elapsedSec = (Date.now() - state.startTime) / 1000;
  }

  setScreen("questions");
}

function answerQuestion(key, value) {
  state.answers[key] = value;
  render();
}

function areAllQuestionsAnswered() {
  return Object.values(state.answers).every((value) => value !== null);
}

function calculateScore() {
  let score = 0;

  if (state.elapsedSec > 40) score += 25;
  else if (state.elapsedSec > 25) score += 15;
  else score += 5;

  if (state.gaze.fixations > 20) score += 20;
  else if (state.gaze.fixations > 10) score += 10;

  if (state.gaze.regressions > 10) score += 20;
  else if (state.gaze.regressions > 5) score += 10;

  if (state.gaze.lineJumps > 6) score += 10;
  else if (state.gaze.lineJumps > 2) score += 5;

  Object.values(state.answers).forEach((value) => {
    score += value * 4;
  });

  return Math.min(score, 100);
}

function getLevel(score) {
  if (score < 30) return "Lower indicators";
  if (score < 60) return "Moderate indicators";
  return "Stronger indicators";
}

async function submitResults() {
  if (!areAllQuestionsAnswered()) {
    alert("Please answer all questions before continuing.");
    return;
  }

  const score = calculateScore();
  const level = getLevel(score);

  state.finalScore = score;
  state.finalLevel = level;
  state.participantId = "P-" + Math.random().toString(36).slice(2, 8).toUpperCase();

  const payload = {
    participantId: state.participantId,
    gradeBand: state.gradeBand,
    passageId: `passage-${state.gradeBand}`,
    readingTimeSec: Number(state.elapsedSec.toFixed(1)),
    fixations: state.gaze.fixations,
    regressions: state.gaze.regressions,
    lineJumps: state.gaze.lineJumps,
    answers: state.answers,
    score,
    level
  };

  if (WEBHOOK_URL && WEBHOOK_URL !== "PASTE_YOUR_GOOGLE_APPS_SCRIPT_URL_HERE") {
    try {
      await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.warn("Webhook failed:", error);
    }
  }

  setScreen("results");
}

function restartApp() {
  resetAnswers();
  resetReadingData();
  state.gradeBand = "";
  state.finalScore = 0;
  state.finalLevel = "";
  state.participantId = "";
  setScreen("permission");
}

function renderPermission() {
  app.innerHTML = `
    <section class="card">
      <div class="hero">
        <div>
          <div class="eyebrow">Reading Screening Experience</div>
          <h1>Dyslexia Eye Movement Screening Tool</h1>
          <p>
            This tool uses camera and microphone access during a short reading activity to observe
            reading patterns that may suggest possible signs of difficulty.
          </p>
          <p class="muted">
            It is a screening support tool for education and research. It is not a diagnosis.
          </p>

          <div class="notice">
            You must allow camera and microphone access before the screening can begin.
          </div>

          <div class="actions">
            <button onclick="requestPermissions()">Allow Camera & Microphone</button>
          </div>
        </div>

        <div class="panel">
          <h3>What happens in this screening?</h3>
          <div class="feature-list">
            <div class="feature"><strong>Step 1:</strong> Grant camera and microphone access.</div>
            <div class="feature"><strong>Step 2:</strong> Read two short information screens.</div>
            <div class="feature"><strong>Step 3:</strong> Choose a grade range and read a passage out loud.</div>
            <div class="feature"><strong>Step 4:</strong> Answer a few questions and view the summary.</div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderIntro() {
  app.innerHTML = `
    <section class="card">
      ${progressMarkup()}
      <h2>What is Dyslexia?</h2>
      <p>
        Dyslexia is a learning difference that affects how the brain processes written language.
        It can make reading, spelling, and writing more difficult, even when a student is bright,
        capable, and has had opportunities to learn.
      </p>
      <p>
        Many students with dyslexia have difficulty connecting letters and sounds quickly and accurately.
        Reading may feel slower, less automatic, or more tiring than it does for other students.
      </p>
      <p>
        Dyslexia is not caused by low intelligence, poor effort, or laziness. It is a difference
        in how reading and language are processed.
      </p>
      <div class="info-box">
        <strong>Important:</strong> With the right support, tools, and practice, many learners with dyslexia
        become very successful readers and thinkers.
      </div>
      <div class="actions">
        <button class="secondary" onclick="setScreen('permission')">Back</button>
        <button onclick="setScreen('importance')">Continue</button>
      </div>
    </section>
  `;
}

function renderImportance() {
  app.innerHTML = `
    <section class="card">
      ${progressMarkup()}
      <h2>Why Early Identification Is Important</h2>
      <p>
        Early identification helps students get support sooner. When reading challenges are noticed
        earlier, it becomes easier to build confidence, improve reading habits, and reduce frustration.
      </p>
      <p>
        Without support, some students may begin avoiding reading, feel discouraged at school,
        or believe they are not good learners when they simply need the right kind of help.
      </p>
      <div class="notice">
        This screening is meant to raise awareness and support next steps. It does not give a diagnosis.
      </div>
      <div class="actions">
        <button class="secondary" onclick="setScreen('intro')">Back</button>
        <button onclick="setScreen('grade')">Continue</button>
      </div>
    </section>
  `;
}

function renderGrade() {
  app.innerHTML = `
    <section class="card">
      ${progressMarkup()}
      <div class="center">
        <h2>Select Your Grade Range</h2>
        <p class="muted">Choose the grade group that best matches the reader.</p>
      </div>

      <div class="grid">
        ${Object.entries(gradeDetails)
          .map(
            ([key, item]) => `
              <button class="grade-card" onclick="chooseGrade('${key}')">
                <div class="grade-title">${item.title}</div>
                <div class="grade-desc">${item.description}</div>
              </button>
            `
          )
          .join("")}
      </div>

      <div class="actions">
        <button class="secondary" onclick="setScreen('importance')">Back</button>
      </div>
    </section>
  `;
}

function renderInstructions() {
  const gradeTitle = gradeDetails[state.gradeBand]?.title || "Selected Grade";

  app.innerHTML = `
    <section class="card">
      ${progressMarkup()}
      <h2>Before You Start Reading</h2>
      <p>
        You selected <strong>${gradeTitle}</strong>. Please follow these steps before starting.
      </p>

      <div class="instruction-list">
        <div class="instruction-item">
          <div class="instruction-number">1</div>
          <div>
            <strong>Sit facing the screen.</strong><br />
            Keep your arms away from your face as much as possible.
          </div>
        </div>

        <div class="instruction-item">
          <div class="instruction-number">2</div>
          <div>
            <strong>Avoid bright light in your face.</strong><br />
            Try to sit where the camera can see you clearly without strong glare.
          </div>
        </div>

        <div class="instruction-item">
          <div class="instruction-number">3</div>
          <div>
            <strong>The computer will handle brightness.</strong><br />
            Just make sure you can see the words clearly.
          </div>
        </div>

        <div class="instruction-item">
          <div class="instruction-number">4</div>
          <div>
            <strong>Read the passage out loud.</strong><br />
            Press <strong>Start Reading</strong> when you begin and <strong>Stop Reading</strong> as soon as you finish.
          </div>
        </div>
      </div>

      <div class="notice">
        The eye movement analysis runs in the background. It will not be shown on the reading screen.
      </div>

      <div class="actions">
        <button class="secondary" onclick="setScreen('grade')">Back</button>
        <button onclick="goToReadingScreen()">Continue to Reading</button>
      </div>
    </section>
  `;
}

function renderReading() {
  const passage = passages[state.gradeBand] || "";

  app.innerHTML = `
    <section class="card">
      ${progressMarkup()}
      <div class="reading-shell">
        <div class="reading-top">
          <div>
            <h2>Reading Passage</h2>
            <p class="muted">Read the paragraph out loud. Press Start when you begin and Stop when you finish.</p>
          </div>

          <div class="timer-chip">
            <div>
              <div class="timer-label">Reading Time</div>
              <div id="timerValue" class="timer-value">${formatTime(state.elapsedSec)}</div>
            </div>
          </div>
        </div>

        <div class="reading-note">
          Read naturally and clearly. Eye tracking is active in the background.
        </div>

        <div class="passage">
          ${passage}
        </div>

        <div class="actions">
          <button id="startBtn" onclick="startReading()" ${state.readingStarted ? "disabled" : ""}>Start Reading</button>
          <button id="stopBtn" class="stop-btn" onclick="stopReading()" ${state.readingStarted ? "" : "disabled"}>Stop Reading</button>
        </div>
      </div>
    </section>
  `;
}

function renderQuestions() {
  app.innerHTML = `
    <section class="card">
      ${progressMarkup()}
      <h2>After Reading</h2>
      <p class="muted">Answer the questions below based on how the reading felt.</p>

      <div class="questions-wrap">
        ${questions
          .map(([key, label]) => {
            const current = state.answers[key];
            return `
              <div class="question">
                <p><strong>${label}</strong></p>
                <div class="option-row">
                  <button class="${current === 0 ? "selected" : "secondary"}" onclick="answerQuestion('${key}', 0)">No</button>
                  <button class="${current === 1 ? "selected" : "secondary"}" onclick="answerQuestion('${key}', 1)">Sometimes</button>
                  <button class="${current === 2 ? "selected" : "secondary"}" onclick="answerQuestion('${key}', 2)">Often</button>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>

      <div class="actions">
        <button class="secondary" onclick="setScreen('reading')">Back</button>
        <button onclick="submitResults()">See Results</button>
      </div>
    </section>
  `;
}

function renderResults() {
  app.innerHTML = `
    <section class="card">
      ${progressMarkup()}
      <h2>Screening Results</h2>

      <div class="result-band">
        <p><strong>Summary level:</strong> ${state.finalLevel}</p>
        <p class="small muted">
          This summary is based on reading time, eye movement pattern indicators, and the answers provided after reading.
        </p>
      </div>

      <div class="kpis">
        <div class="kpi">
          <div class="kpi-label">Score</div>
          <div class="kpi-value">${state.finalScore}</div>
        </div>

        <div class="kpi">
          <div class="kpi-label">Reading Time</div>
          <div class="kpi-value">${formatTime(state.elapsedSec)}</div>
        </div>

        <div class="kpi">
          <div class="kpi-label">Participant ID</div>
          <div class="kpi-value" style="font-size:1.05rem;">${state.participantId}</div>
        </div>
      </div>

      <div class="notice">
        This tool is for educational screening support only. It is not a medical diagnosis.
      </div>

      <div class="actions">
        <button onclick="setScreen('thanks')">Continue</button>
      </div>
    </section>
  `;
}

function renderThanks() {
  app.innerHTML = `
    <section class="card center">
      <h2>Thank You</h2>
      <p>
        Early awareness can make a meaningful difference in helping students get the support they need.
      </p>
      <p>
        This project was developed by <strong>Brianne Kniff</strong> as an independent research initiative
        exploring the connection between reading, neuroscience, education, and artificial intelligence.
      </p>
      <p class="small muted">
        This tool is intended for educational and research purposes only and does not provide a diagnosis.
      </p>

      <div class="actions" style="justify-content:center;">
        <button onclick="restartApp()">Start Again</button>
      </div>
    </section>
  `;
}

function render() {
  switch (state.screen) {
    case "permission":
      renderPermission();
      break;
    case "intro":
      renderIntro();
      break;
    case "importance":
      renderImportance();
      break;
    case "grade":
      renderGrade();
      break;
    case "instructions":
      renderInstructions();
      break;
    case "reading":
      renderReading();
      break;
    case "questions":
      renderQuestions();
      break;
    case "results":
      renderResults();
      break;
    case "thanks":
      renderThanks();
      break;
    default:
      renderPermission();
      break;
  }
}

window.requestPermissions = requestPermissions;
window.setScreen = setScreen;
window.chooseGrade = chooseGrade;
window.goToReadingScreen = goToReadingScreen;
window.startReading = startReading;
window.stopReading = stopReading;
window.answerQuestion = answerQuestion;
window.submitResults = submitResults;
window.restartApp = restartApp;

render();
