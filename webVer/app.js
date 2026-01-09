(() => {
  const streamEl = document.getElementById("stream");
  const terminalEl = document.getElementById("terminal");
  const shellEl = document.getElementById("shell");
  const statusEl = document.getElementById("status");
  const rootEl = document.documentElement;
  const dotEls = Array.from(document.querySelectorAll(".shell__dot"));

  const hueDistance = (a, b) => {
    const diff = Math.abs(a - b) % 360;
    return Math.min(diff, 360 - diff);
  };

  const pickDistinctHues = (count, minDistance) => {
    const hues = [];
    let attempts = 0;
    while (hues.length < count && attempts < 500) {
      const hue = Math.floor(Math.random() * 360);
      if (hues.every((existing) => hueDistance(existing, hue) >= minDistance)) {
        hues.push(hue);
      }
      attempts += 1;
    }
    if (hues.length < count) {
      const base = Math.floor(Math.random() * 360);
      return Array.from({ length: count }, (_, index) => (base + index * 120) % 360);
    }
    return hues;
  };

  const applyPageHue = (pageHue) => {
    rootEl.style.setProperty("--page-hue", `${pageHue}deg`);
  };

  if (dotEls.length) {
    const hues = pickDistinctHues(dotEls.length, 60);
    dotEls.forEach((dot, index) => {
      const hue = hues[index % hues.length];
      dot.style.setProperty("--dot-hue", `${hue}deg`);
      dot.dataset.hue = String(hue);
      dot.addEventListener("click", () => {
        applyPageHue(hue);
      });
    });
    applyPageHue(hues[0]);
  }

  let isRunning = false;
  let currentInputLine = null;
  let currentInput = null;

  const appendLine = (text, className) => {
    const line = document.createElement("div");
    line.className = "line" + (className ? ` ${className}` : "");
    if (text === "") {
      line.textContent = " ";
    } else if (/^https?:\/\/\S+$/.test(text)) {
      const link = document.createElement("a");
      link.href = text;
      link.textContent = text;
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      link.className = "line-link";
      line.appendChild(link);
    } else {
      line.textContent = text;
    }
    streamEl.appendChild(line);
    scrollToBottom();
  };

  const appendSummaryLine = (start, firstDate, middle, lastDate) => {
    const line = document.createElement("div");
    line.className = "line";

    line.append(document.createTextNode(start));
    const firstSpan = document.createElement("span");
    firstSpan.className = "accent";
    firstSpan.textContent = firstDate;
    line.appendChild(firstSpan);
    line.append(document.createTextNode(middle));
    const lastSpan = document.createElement("span");
    lastSpan.className = "accent";
    lastSpan.textContent = lastDate;
    line.appendChild(lastSpan);

    streamEl.appendChild(line);
    scrollToBottom();
  };

  const scrollToBottom = () => {
    terminalEl.scrollTop = terminalEl.scrollHeight;
  };

  const setStatus = (text) => {
    statusEl.textContent = text;
  };

  const setRunning = (value) => {
    isRunning = value;
    shellEl.classList.toggle("is-running", value);
    if (currentInput) {
      currentInput.contentEditable = String(!value);
    }
    setStatus(value ? "running" : "idle");
  };

  const focusInput = (toEnd = false) => {
    if (!currentInput) {
      return;
    }
    currentInput.focus();
    if (!toEnd) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(currentInput);
    range.collapse(false);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  const readInput = () => (currentInput ? currentInput.innerText || "" : "");

  const insertInputText = (text) => {
    if (!text || !currentInput) {
      return;
    }
    const existing = readInput();
    const needsNewline = existing && !existing.endsWith("\n");
    const merged = existing + (needsNewline ? "\n" : "") + text;
    currentInput.textContent = merged;
    focusInput(true);
  };

  const normalizeJsonText = (text) => text.replace(/\r\n/g, "\n").trim();

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const createInputLine = () => {
    const line = document.createElement("div");
    line.className = "input-line";

    const prompt = document.createElement("span");
    prompt.className = "prompt";
    prompt.textContent = "NodeProjectDater $";

    const input = document.createElement("div");
    input.className = "input";
    input.contentEditable = "true";
    input.spellcheck = false;
    input.dataset.placeholder = "Enter package JSON...";

    line.appendChild(prompt);
    line.appendChild(input);

    return { line, input };
  };

  const mountInputLine = () => {
    const { line, input } = createInputLine();
    streamEl.appendChild(line);
    currentInputLine = line;
    currentInput = input;
    input.addEventListener("keyup", handleKeyUp);
    scrollToBottom();
  };

  const commitInputLine = (text) => {
    if (!currentInputLine) {
      return;
    }
    const line = document.createElement("div");
    line.className = "input-line";

    const prompt = document.createElement("span");
    prompt.className = "prompt";
    prompt.textContent = "NodeProjectDater $";

    const body = document.createElement("div");
    body.className = "input is-history";
    body.textContent = text || "";

    line.appendChild(prompt);
    line.appendChild(body);

    streamEl.replaceChild(line, currentInputLine);
    currentInputLine = null;
    currentInput = null;
  };

  const handleRun = async () => {
    if (isRunning || !currentInput) {
      return;
    }

    const rawInput = readInput();
    const rawText = normalizeJsonText(rawInput);
    const command = rawText.trim().toLowerCase();
    if (command === "help") {
      commitInputLine(rawText);
      appendLine("Usage: Paste or drop a package JSON and press enter", "dim");
      appendLine("help  - show this message", "dim");
      appendLine("clear - clear the terminal", "dim");
      appendLine("")
      mountInputLine();
      focusInput(true);
      return;
    }
    if (command === "clear") {
      commitInputLine(rawText);
      streamEl.innerHTML = "";
      appendLine("/*", "dim")
      appendLine(" * Paste or drag-and-drop a package JSON", "dim");
      appendLine(" * To calculate its last update time", "dim");
      appendLine(" */", "dim");
      appendLine("https://github.com/TMBMode/NodeProjectDater", "dim");
      appendLine("", "dim");
      mountInputLine();
      focusInput(true);
      return;
    }
    commitInputLine(rawInput);
    setRunning(true);

    const logLine = async (text, className) => {
      appendLine(text, className);
    };

    const logSummaryLine = async (start, firstDate, middle, lastDate) => {
      appendSummaryLine(start, firstDate, middle, lastDate);
    };

    let packageJson;
    try {
      packageJson = JSON.parse(rawText);
    } catch (error) {
      await logLine("Invalid JSON", "error");
      appendLine("");
      setRunning(false);
      mountInputLine();
      focusInput(true);
      return;
    }

    const dependencies = {};
    if (packageJson.dependencies) {
      Object.assign(dependencies, packageJson.dependencies);
    }
    if (packageJson.devDependencies) {
      Object.assign(dependencies, packageJson.devDependencies);
    }

    if (Object.keys(dependencies).length === 0) {
      await logLine("* No dependency found", "warning");
      setRunning(false);
      mountInputLine();
      focusInput(true);
      return;
    }

    await logLine("");

    let earliestPossibleDate = 0;
    let latestPossibleDate = new Date(3376727114000).getTime();
    const dateRanges = [];

    let lastDependencyCheckAt = 0;
    const ensureDependencyCheckInterval = async () => {
      const now = Date.now();
      const elapsed = now - lastDependencyCheckAt;
      if (elapsed < 325) {
        await sleep(325 - elapsed);
      }
      lastDependencyCheckAt = Date.now();
    };

    for (const [packageName, packageVersion] of Object.entries(dependencies)) {
      if (packageVersion === "latest") {
        await logLine(`${packageName} * Skip as using latest`);
        continue;
      }

      await ensureDependencyCheckInterval();

      const targetVersion = String(packageVersion)
        .replace("^", "")
        .replace("~", "");

      let timeData;
      try {
        timeData = await fetchPackageTime(packageName);
      } catch (error) {
        await logLine("Invalid JSON output", "error");
        setRunning(false);
        mountInputLine();
        focusInput(true);
        return;
      }

      try {
        const versions = Object.entries(timeData)
          .map(([version, date]) => ({
            version,
            date: Date.parse(date),
          }))
          .filter((item) => item.version !== "created")
          .filter((item) => !item.version.includes("-"));

        const sortedVersions = versions.sort((a, b) => (a.date > b.date ? 1 : -1));
        let isFound = false;

        for (let i = 0; i < sortedVersions.length; i++) {
          const { version, date } = sortedVersions[i];
          if (version === targetVersion) {
            let nextDate;
            for (let j = i + 1; j < sortedVersions.length; j++) {
              if (compareSemver(sortedVersions[j].version, version) > 0) {
                nextDate = sortedVersions[j].date;
                break;
              }
            }
            const rangeEnd = nextDate ?? latestPossibleDate;
            dateRanges.push({ packageName, start: date, end: rangeEnd });
            await logLine(
              `${packageName} | ${version} | ${formatDate(date)} -> ${formatDate(rangeEnd)}`
            );
            isFound = true;
            break;
          }
        }

        if (!isFound) {
          await logLine(`${packageName} * Not found`);
        }
      } catch (error) {
        await logLine("Invalid JSON output", "error");
        setRunning(false);
        mountInputLine();
        focusInput(true);
        return;
      }
    }

    if (dateRanges.length > 0) {
      earliestPossibleDate = dateRanges.reduce(
        (current, range) => (current > range.start ? current : range.start),
        earliestPossibleDate
      );
      const validEnds = dateRanges
        .map((range) => range.end)
        .filter((end) => end >= earliestPossibleDate);
      if (validEnds.length > 0) {
        latestPossibleDate = validEnds.reduce(
          (current, end) => (current < end ? current : end),
          latestPossibleDate
        );
      }
    }

    await logLine("");
    await logLine("-".repeat(30));
    await logLine("");
    await logLine("According to dependency versions,");
    await logLine("This package.json was last updated within the date range:");
    await logLine("");
    await logSummaryLine(
      "~ ",
      formatDate(earliestPossibleDate),
      " -> ",
      formatDate(latestPossibleDate)
    );
    await logLine("");
    await logLine("-".repeat(30));
    await logLine("");

    setRunning(false);
    mountInputLine();
    focusInput(true);
  };

  const fetchPackageTime = async (packageName) => {
    const response = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(packageName)}`
    );
    if (!response.ok) {
      throw new Error("Failed to load package metadata");
    }
    const data = await response.json();
    if (!data || !data.time) {
      throw new Error("Missing time data");
    }
    return data.time;
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const compareSemver = (a, b) =>
    a
      .replace(/\d+/g, (n) => String(n).padStart(6, "0"))
      .localeCompare(b.replace(/\d+/g, (n) => String(n).padStart(6, "0")));

  const handleKeyUp = (event) => {
    if (event.key !== "Enter") {
      return;
    }
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (!currentInput || isRunning) {
      return;
    }
    const text = readInput();
    if (/\n\s*\n\s*$/.test(text)) {
      handleRun();
    }
  };

  terminalEl.addEventListener("click", () => focusInput(false));

  let dragCounter = 0;
  document.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dragCounter += 1;
    document.body.classList.add("is-dragover");
  });

  document.addEventListener("dragleave", (event) => {
    event.preventDefault();
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) {
      document.body.classList.remove("is-dragover");
    }
  });

  document.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  document.addEventListener("drop", async (event) => {
    event.preventDefault();
    dragCounter = 0;
    document.body.classList.remove("is-dragover");

    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
      return;
    }

    if (dataTransfer.files && dataTransfer.files.length > 0) {
      const file = dataTransfer.files[0];
      const text = await file.text();
      insertInputText(normalizeJsonText(text));
      return;
    }

    const text = dataTransfer.getData("text");
    if (text) {
      insertInputText(normalizeJsonText(text));
    }
  });

  appendLine("/*", "dim")
  appendLine(" * Paste or drag-and-drop a package JSON", "dim");
  appendLine(" * To calculate its last update time", "dim");
  appendLine(" */", "dim");
  appendLine("https://github.com/TMBMode/NodeProjectDater", "dim");
  appendLine("", "dim");

  mountInputLine();
  focusInput(true);
})();
