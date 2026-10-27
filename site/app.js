(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [
    ...root.querySelectorAll(selector),
  ];
  const scenes = $$(".scene");
  const sceneNames = [
    "BEFORE THE FIRST NOTE",
    "THE CITY OF SA",
    "HOLLOW, THE BOY WITHOUT A NOTE",
    "WHAT THE WORLD REMEMBERS",
    "THE REST",
  ];
  const noteNames = ["Sa", "Re", "Ga", "Ma", "Pa", "Dha", "Ni"];
  const frequencies = [261.63, 293.66, 329.63, 349.23, 392, 440, 493.88];
  const activatedNotes = new Set();
  let activeScene = 0;
  let puzzleStep = 0;
  let releasedStrings = 0;
  let forceCount = 0;
  let soundEnabled = true;
  let audioContext = null;
  let sequenceTimers = [];

  function audio() {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor || !soundEnabled) return null;
    try {
      if (!audioContext) audioContext = new AudioCtor();
      if (audioContext.state === "suspended") audioContext.resume();
      return audioContext;
    } catch (error) {
      announceSoundUnavailable();
      return null;
    }
  }
  function announceSoundUnavailable() {
    const support = $("#sound-support");
    if (!support.hidden) return;
    support.textContent =
      "This browser cannot play the optional tones. The experience continues without audio.";
    support.hidden = false;
    window.setTimeout(() => {
      support.hidden = true;
    }, 4200);
  }
  function playTone(index, duration = 0.42, startAt = 0) {
    const ctx = audio();
    if (!ctx) return;
    try {
      const start = ctx.currentTime + startAt;
      const oscillator = ctx.createOscillator();
      const overtone = ctx.createOscillator();
      const gain = ctx.createGain();
      const overtoneGain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequencies[index];
      overtone.type = "sine";
      overtone.frequency.value = frequencies[index] * 2;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.055, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      overtoneGain.gain.setValueAtTime(0.0001, start);
      overtoneGain.gain.exponentialRampToValueAtTime(0.009, start + 0.06);
      overtoneGain.gain.exponentialRampToValueAtTime(
        0.0001,
        start + duration * 0.78,
      );
      oscillator.connect(gain).connect(ctx.destination);
      overtone.connect(overtoneGain).connect(ctx.destination);
      oscillator.start(start);
      overtone.start(start);
      oscillator.stop(start + duration + 0.03);
      overtone.stop(start + duration + 0.03);
    } catch (error) {
      announceSoundUnavailable();
    }
  }
  function clearCadence() {
    sequenceTimers.forEach(window.clearTimeout);
    sequenceTimers = [];
  }
  function say(el, text) {
    if (el) el.textContent = text;
  }

  function showScene(index, moveFocus = false) {
    const bounded = Math.max(0, Math.min(scenes.length - 1, index));
    activeScene = bounded;
    scenes.forEach((scene, i) => {
      const current = i === bounded;
      scene.hidden = !current;
      scene.classList.toggle("is-visible", current);
      scene.setAttribute("aria-hidden", current ? "false" : "true");
    });
    $$(".scene-link").forEach((link, i) => {
      link.classList.toggle("is-active", i === bounded);
      if (i === bounded) link.setAttribute("aria-current", "step");
      else link.removeAttribute("aria-current");
    });
    $("#scene-index").textContent = String(bounded + 1).padStart(2, "0");
    say($("#scene-label"), sceneNames[bounded]);
    say($("#footer-position"), `${String(bounded + 1).padStart(2, "0")} / 05`);
    $("#progress-fill").style.width =
      `${((bounded + 1) / scenes.length) * 100}%`;
    history.replaceState(null, "", `#scene-${bounded + 1}`);
    clearCadence();
    if (moveFocus) {
      const heading = $("h1, h2", scenes[bounded]);
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      }
      window.scrollTo({
        top: 0,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    }
  }
  $$("[data-go]").forEach((button) =>
    button.addEventListener("click", (event) => {
      event.preventDefault();
      showScene(Number(button.dataset.go), true);
    }),
  );
  $$("[data-next]").forEach((button) =>
    button.addEventListener("click", () =>
      showScene(Math.min(activeScene + 1, 4), true),
    ),
  );

  $$(".note-key").forEach((button) =>
    button.addEventListener("click", () => {
      const index = Number(button.dataset.note);
      if (activatedNotes.has(index)) return;
      activatedNotes.add(index);
      button.classList.add("is-lit", "pulse");
      button.setAttribute("aria-pressed", "true");
      window.setTimeout(() => button.classList.remove("pulse"), 850);
      playTone(index);
      const count = activatedNotes.size;
      $(".opening-art").dataset.awakened = String(count);
      const messages = [
        "Sa gives the world a place to begin.",
        "Re carries the first movement forward.",
        "Ga opens a space for the world to grow.",
        "Ma gives weight to what has begun.",
        "Pa joins one living thing to another.",
        "Dha carries a phrase toward its return.",
        "Ni leans toward the note that began it all.",
      ];
      say(
        $("#creation-feedback"),
        `${noteNames[index]} — ${messages[index]}  ·  ${count} of 7 awakened.`,
      );
      if (count === 7) {
        $("#revealed-title").hidden = false;
        say(
          $("#creation-feedback"),
          "Seven notes, each a different way to understand the world. Now the first phrase can end.",
        );
      }
    }),
  );

  const districtCopy = {
    strung:
      "The Strung Districts: bridges and towers tuned to one another, every span held in the same long chord.",
    rings:
      "The Ring Streets: concentric roads carried rhythm from neighborhood to neighborhood, so no part of Sa had to stand alone.",
    quiet:
      "The Quiet Quarter: once a place to listen between notes. After the Rest was abolished, its empty halls became a warning.",
  };
  $$(".district-chip").forEach((button) =>
    button.addEventListener("click", () => {
      $$(".district-chip").forEach((item) => {
        item.classList.toggle("is-selected", item === button);
        item.setAttribute("aria-pressed", item === button ? "true" : "false");
      });
      say($("#district-copy"), districtCopy[button.dataset.district]);
    }),
  );
  $$(".state-choice").forEach((button) =>
    button.addEventListener("click", () => {
      const fading = button.dataset.cityState === "fading";
      $$(".state-choice").forEach((item) => {
        item.classList.toggle("is-current", item === button);
        item.setAttribute("aria-pressed", item === button ? "true" : "false");
      });
      $("#city-art-card").dataset.state = fading ? "fading" : "sustained";
      say(
        $("#city-condition"),
        fading ? "RESONANCE: UNRAVELLING" : "RESONANCE: HELD",
      );
      say(
        $("#state-copy"),
        fading
          ? "No note gets to finish. Stone grows brittle; memories cannot loosen their hold. The world does not fall to an enemy—it wears away beneath what never ended."
          : "For generations, the notes did not end. The city called the endless chord safety.",
      );
    }),
  );

  $("#borrow-note").addEventListener("click", () => {
    if (puzzleStep !== 0) return;
    puzzleStep = 1;
    $("#puzzle-art-card").dataset.state = "borrowed";
    $("#apply-note").disabled = false;
    playTone(2);
    say(
      $("#puzzle-feedback"),
      "Borrowed: Ga, for a moment. Hollow cannot make it his.",
    );
    say(
      $("#puzzle-guidance"),
      "A borrowed note is enough to begin—but it is not something he can keep. Apply it to the broken mechanism.",
    );
  });
  $("#apply-note").addEventListener("click", () => {
    if (puzzleStep !== 1) return;
    puzzleStep = 2;
    $("#puzzle-art-card").dataset.state = "applied";
    $("#apply-note").disabled = true;
    $("#puzzle-actions").hidden = false;
    playTone(2, 0.72);
    say(
      $("#puzzle-feedback"),
      "The teeth engage. For a moment, the mechanism moves.",
    );
    say(
      $("#puzzle-guidance"),
      "Now choose: hold the borrowed sound until it strains, or let the phrase finish on its own.",
    );
  });
  $("#sustain-note").addEventListener("click", () => {
    if (puzzleStep !== 2) return;
    puzzleStep = 3;
    $("#puzzle-art-card").dataset.state = "unstable";
    $("#puzzle-actions").hidden = true;
    $("#fade-note").hidden = false;
    $("#puzzle-actions").hidden = false;
    $("#sustain-note").hidden = true;
    say(
      $("#puzzle-feedback"),
      "Too long. The mechanism shivers; the borrowed note cannot hold it forever.",
    );
    say(
      $("#puzzle-guidance"),
      "The mechanism is unstable. Hollow could force the sound further—but listen for the moment it is ready to end.",
    );
  });
  $("#fade-note").addEventListener("click", () => {
    if (puzzleStep !== 2 && puzzleStep !== 3) return;
    puzzleStep = 4;
    $("#puzzle-art-card").dataset.state = "stable";
    $("#puzzle-actions").hidden = true;
    $("#puzzle-result").hidden = false;
    say(
      $("#puzzle-feedback"),
      "The note fades. The mechanism settles into stillness.",
    );
    say(
      $("#puzzle-guidance"),
      "No force was needed. The Rest gave the structure room to hold.",
    );
  });

  const memories = {
    erased: {
      tab: "#tab-erased",
      reference: "RECOVERED LEAF / 01 OF 03",
      kicker: "THE QUIET QUARTER",
      title: "They feared what could not be held.",
      copy: "The People of Silence understood the Rest: every note needs room to end. They had no greater power than anyone else. They simply knew that a world kept ringing without pause would begin to break.",
      foot: "Their warning sounded like a threat to those who had mistaken control for safety. They were persecuted and nearly erased from history.",
    },
    twins: {
      tab: "#tab-twins",
      reference: "RECOVERED LEAF / 02 OF 03",
      kicker: "AN UNSEALED ACCOUNT",
      title: "Two cries. Two blankets. One order.",
      copy: "A mother asked that her newborn children be separated before the people hunting this history could find them both. The record stops there. No names remain on this page.",
      foot: "Beyond the known world, someone has been growing up with a story just as incomplete.",
    },
    purpose: {
      tab: "#tab-purpose",
      reference: "RECOVERED LEAF / 03 OF 03",
      kicker: "A NOTE LEFT IN THE MARGIN",
      title: "A sound needs a place to go.",
      copy: "A wall does not stand on vibration alone. It must be allowed to settle. A memory must be carried, then given space. The Rest does not erase what happened; it lets what happened become part of what comes next.",
      foot: "The Fading is not an invading force. It is what the world becomes when nothing is allowed to change.",
    },
  };
  $$(".archive-tab").forEach((button) =>
    button.addEventListener("click", () => {
      const memory = memories[button.dataset.memory];
      $$(".archive-tab").forEach((item) => {
        const selected = item === button;
        item.classList.toggle("is-active", selected);
        item.setAttribute("aria-selected", selected ? "true" : "false");
      });
      const panel = $("#memory-panel");
      panel.setAttribute("aria-labelledby", button.id);
      say($("#memory-reference"), memory.reference);
      say($("#memory-kicker"), memory.kicker);
      say($("#memory-title"), memory.title);
      say($("#memory-copy"), memory.copy);
      say($("#memory-foot"), memory.foot);
    }),
  );

  function updateRelease() {
    $("#rest-layout").dataset.released = String(releasedStrings);
    say($("#release-count"), `${releasedStrings} / 4 RELEASED`);
    const feedback = [
      "The first string still carries a phrase.",
      "One phrase has found its ending. Three remain.",
      "Two strings fall quiet. The city still trembles.",
      "Only one connection remains. The stored noise thins.",
      "All four strings are released. The choice is Hollow’s—and yours.",
    ];
    say($("#rest-feedback"), feedback[releasedStrings]);
    if (releasedStrings === 4) {
      $("#final-choice").hidden = false;
      $("#scar-note").textContent =
        "Whatever follows, the scars will remain. What changes is whether the next sound has room.";
    }
  }
  $$(".release-string").forEach((button) =>
    button.addEventListener("click", () => {
      if (
        button.disabled ||
        releasedStrings >= 4 ||
        Number(button.dataset.string) !== releasedStrings
      )
        return;
      button.classList.add("is-released");
      button.querySelector(".string-state").textContent = "RELEASED";
      button.setAttribute("aria-pressed", "true");
      releasedStrings++;
      playTone((releasedStrings + 1) % 7, 0.5);
      $$(".release-string").forEach((item, index) => {
        item.disabled = index !== releasedStrings;
      });
      updateRelease();
    }),
  );

  $("#force-music").addEventListener("click", () => {
    forceCount++;
    $("#rest-layout").classList.remove("final-silence");
    $("#rest-layout").style.filter =
      `saturate(${Math.max(0.7, 1 + forceCount * 0.12)})`;
    $("#force-feedback").hidden = false;
    $("#reconsider").hidden = false;
    $("#final-buttons").hidden = false;
    say(
      $("#rest-feedback"),
      forceCount > 1
        ? "Again, the strings tighten. Again, the city begins to fracture."
        : "The old answer tightens the strings. Stone fractures. More noise cannot resolve what endless sound created.",
    );
    $("#rest-art-card").animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-2px) rotate(-.2deg)" },
        { transform: "translateX(2px) rotate(.2deg)" },
        { transform: "translateX(0)" },
      ],
      { duration: 340, iterations: 2 },
    );
    playTone(5, 0.3);
  });
  $("#reconsider").addEventListener("click", () => {
    $("#force-feedback").hidden = true;
    $("#reconsider").hidden = true;
    $("#rest-layout").style.filter = "";
    say(
      $("#rest-feedback"),
      "The strings wait. There is still another way to listen.",
    );
    $("#let-end").focus();
  });
  function playCadence() {
    clearCadence();
    const indices = [0, 1, 2, 3, 4, 5, 6];
    indices.forEach((note, i) => {
      sequenceTimers.push(
        window.setTimeout(() => {
          const key = $(`.cadence-note[data-cadence-note="${note}"]`);
          if (key) {
            key.classList.add("is-pulsing");
            window.setTimeout(() => key.classList.remove("is-pulsing"), 700);
          }
          playTone(note, 0.42);
        }, i * 520),
      );
    });
    sequenceTimers.push(
      window.setTimeout(
        () => {
          $(".final-cadence").classList.add("has-ended");
          say(
            $("#ending-after"),
            "The city survives its first moment of true silence. The note has ended. The silence remains.",
          );
        },
        7 * 520 + 1700,
      ),
    );
  }
  $("#let-end").addEventListener("click", () => {
    $("#rest-layout").classList.add("final-silence");
    $("#final-choice").hidden = true;
    $("#ending-copy").hidden = false;
    say(
      $("#rest-feedback"),
      "The strings fall quiet. The city does not mend; it has room to breathe.",
    );
    say(
      $("#ending-after"),
      "The city survives its first moment of true silence.",
    );
    showScene(4, false);
    playCadence();
    $("#replay-ending").focus({ preventScroll: true });
  });
  $("#replay-ending").addEventListener("click", () => resetExperience(true));
  function resetExperience(moveFocus = false) {
    clearCadence();
    activatedNotes.clear();
    $$(".note-key").forEach((key) => {
      key.classList.remove("is-lit", "pulse");
      key.removeAttribute("aria-pressed");
    });
    $(".opening-art").dataset.awakened = "0";
    $("#revealed-title").hidden = true;
    say($("#creation-feedback"), "Seven notes lie dormant. Begin anywhere.");
    $$(".state-choice").forEach((b, i) => {
      b.classList.toggle("is-current", i === 0);
      b.setAttribute("aria-pressed", i === 0 ? "true" : "false");
    });
    $("#city-art-card").dataset.state = "sustained";
    say($("#city-condition"), "RESONANCE: HELD");
    say(
      $("#state-copy"),
      "For generations, the notes did not end. The city called the endless chord safety.",
    );
    $$(".district-chip").forEach((b, i) => {
      b.classList.toggle("is-selected", i === 0);
      b.setAttribute("aria-pressed", i === 0 ? "true" : "false");
    });
    say($("#district-copy"), districtCopy.strung);
    puzzleStep = 0;
    $("#puzzle-art-card").dataset.state = "idle";
    $("#apply-note").disabled = true;
    $("#puzzle-actions").hidden = true;
    $("#sustain-note").hidden = false;
    $("#fade-note").hidden = false;
    $("#puzzle-result").hidden = true;
    say(
      $("#puzzle-feedback"),
      "A string trembles overhead. It has a note to spare.",
    );
    say(
      $("#puzzle-guidance"),
      "Listen first. Borrow the note from the suspended string to begin.",
    );
    $$(".archive-tab").forEach((b, i) => {
      b.classList.toggle("is-active", i === 0);
      b.setAttribute("aria-selected", i === 0 ? "true" : "false");
    });
    $("#memory-panel").setAttribute("aria-labelledby", "tab-erased");
    say($("#memory-reference"), memories.erased.reference);
    say($("#memory-kicker"), memories.erased.kicker);
    say($("#memory-title"), memories.erased.title);
    say($("#memory-copy"), memories.erased.copy);
    say($("#memory-foot"), memories.erased.foot);
    releasedStrings = 0;
    forceCount = 0;
    $$(".release-string").forEach((b, i) => {
      b.classList.remove("is-released");
      b.querySelector(".string-state").textContent = "HELD";
      b.disabled = i !== 0;
      b.removeAttribute("aria-pressed");
    });
    $("#rest-layout").classList.remove("final-silence");
    $("#rest-layout").style.filter = "";
    $("#final-choice").hidden = true;
    $("#final-buttons").hidden = false;
    $("#force-feedback").hidden = true;
    $("#reconsider").hidden = true;
    $("#ending-copy").hidden = true;
    $("#scar-note").textContent =
      "The silence will not mend every stone. It will let the next sound be chosen.";
    updateRelease();
    showScene(0, moveFocus);
  }
  $("#restart").addEventListener("click", () => resetExperience(true));
  $("#sound-toggle").addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    $("#sound-toggle").setAttribute("aria-pressed", String(!soundEnabled));
    say($("#sound-state"), soundEnabled ? "On" : "Off");
    $("#sound-toggle").setAttribute(
      "aria-label",
      soundEnabled ? "Sound is on. Mute sounds" : "Sound is off. Enable sounds",
    );
    if (!soundEnabled && audioContext && audioContext.state === "running")
      audioContext.suspend();
    if (soundEnabled && audioContext && audioContext.state === "suspended")
      audioContext.resume();
  });

  function initialSceneFromHash() {
    const match = window.location.hash.match(/^#scene-([1-5])$/);
    return match ? Number(match[1]) - 1 : 0;
  }
  showScene(initialSceneFromHash(), false);
})();
