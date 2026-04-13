console.log("Westchester Res Tee Time Monitor Loaded");

// ========================== SETTINGS/DYNAMIC INPUT UI ==========================
function createMonitorPanel() {
  if (document.getElementById('tee-time-monitor-panel')) return; // Prevent duplicate

  const panel = document.createElement('div');
  panel.id = 'tee-time-monitor-panel';
  panel.style = `
    position:fixed;top:20px;right:20px;z-index:9999;
    background:#fff;border:1px solid #333;padding:16px;
    font-family:sans-serif;font-size:14px;box-shadow:2px 2px 10px #aaa;max-width:300px;
  `;

  panel.innerHTML = `
    <h3 style="margin:0 0 10px 0;">Tee Time Auto-Monitor</h3>
    <div>
      <label>Date: <input id="tt-date" type="date" value="2025-11-09" style="width:120px;"></label>
    </div>
    <div>
      <label>Start Time: <input id="tt-time-low" type="time" value="09:00"></label>
      <label>End Time: <input id="tt-time-high" type="time" value="10:30"></label>
    </div>
    <div>
      <label>Players: <select id="tt-players">
        <option value="1">1</option><option value="2" selected>2</option>
        <option value="3">3</option><option value="4">4</option>
      </select></label>
    </div>
    <fieldset style="border:1px solid #ccc;padding:8px;">
      <legend>Courses</legend>
      <label><input type="checkbox" id="courseMaple" checked> Maple Moor</label><br>
      <label><input type="checkbox" id="courseMohansic" checked> Mohansic</label><br>
      <label><input type="checkbox" id="courseSaxon" checked> Saxon Woods</label><br>
      <label><input type="checkbox" id="courseSprain" checked> Sprain Lake</label><br>
      <label><input type="checkbox" id="courseDunwoodie"> Dunwoodie</label><br>
      <label><input type="checkbox" id="courseHudson"> Hudson Hills</label><br>
    </fieldset>
    <button id="tt-start-btn">Start Monitoring</button>
    <button id="tt-stop-btn" style="display:none;">Stop Monitoring</button>
    <div id="tt-status" style="margin:6px 0 0 0;"></div>
  `;
  document.body.appendChild(panel);
}
createMonitorPanel();

// ========================== CORE MONITOR LOGIC ==========================
let monitorTimer = null;
let running = false;

// Play beep sound
function playBeep() {
  const audio = new Audio("data:audio/wav;base64,UklGRhYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=");
  audio.play().catch(() => {});
}

// Update status
function setStatus(msg) {
  let status = document.getElementById('tt-status');
  if (status) status.innerText = msg;
}

async function performMonitorCycle() {
  // 1. Perform true reload
  window.location.reload(true);
  setStatus("Reloading page and checking...");

  // Wait for page scripts and HTML
  let tries = 0;
  function afterLoadActions() {
    if (tries++ > 15) return; // Timeout fail-safe

    if (
      document.readyState !== "complete"
      || !document.body
      || !document.querySelector("input[type='date'], input#mobilePickerDate, select,#tt-date")
    ) {
      setTimeout(afterLoadActions, 800);
      return;
    }

    // 2. Set date (try different selectors)
    let dateStr = document.querySelector("#tt-date").value || "2025-11-09";
    let dateISO = dateStr.split("-").join("/"); // YYYY/MM/DD

    // Set date in booking site
    let dateInputs = document.querySelectorAll("input[type='date'], input#mobilePickerDate");
    dateInputs.forEach(input => {
      input.value = dateStr;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 3. Set number of players (try dropdown, picker, direct input)
    let nPlayers = parseInt(document.getElementById("tt-players").value || "2");
    let playerSelects = document.querySelectorAll("select[name*='player'], select#players, select.player-count");
    playerSelects.forEach(sel => {
      sel.value = nPlayers;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    let playerInputs = document.querySelectorAll("input[type='number'][name*='player']");
    playerInputs.forEach(inp => {
      inp.value = nPlayers;
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // 4. Set courses
    let coursesWanted = [];
    ["Maple", "Mohansic", "Saxon", "Sprain"].forEach(course => {
      if (document.getElementById("course" + course) && document.getElementById("course" + course).checked)
        coursesWanted.push(course);
    });
    // Unselect unwanted courses
    ["Dunwoodie", "Hudson"].forEach(course => {
      if (document.getElementById("course" + course))
        document.getElementById("course" + course).checked = false;
      let courseInputs = Array.from(document.querySelectorAll("input[type='checkbox']"));
      courseInputs.forEach(input => {
        if (
          input.value && ["Dunwoodie", "Hudson Hills"].includes(input.value)
          && input.checked
        ) input.click();
      });
    });

    // 5. Set time range
    let timeLow = document.getElementById("tt-time-low").value || "09:00";
    let timeHigh = document.getElementById("tt-time-high").value || "10:30";

    // 6. Trigger search (find or click search button if needed)
    let searchBtns = Array.from(document.querySelectorAll("button, input[type=submit]"));
    let searchBtn = searchBtns.find(btn => /search/i.test(btn.textContent || btn.value || ''));
    if (searchBtn) searchBtn.click();

    // 7. Wait for reservation results, scan for time, and book if found
    setTimeout(() => {
      let found = false;
      let timePattern = /(\d{1,2}):(\d{2})\s*(AM|PM)/i;
      
      document.querySelectorAll('*').forEach(el => {
        let txt = el.textContent.trim();
        let mt = txt.match(timePattern);
        if (mt) {
          let [_, hour, minute, meridiem] = mt;
          hour = parseInt(hour);
          let mins = hour * 60 + parseInt(minute);
          if (meridiem.toUpperCase() === "PM" && hour !== 12) hour += 12;
          if (meridiem.toUpperCase() === "AM" && hour === 12) hour = 0;
          let mins24 = hour * 60 + parseInt(minute);

          // Check time range
          let [lowH, lowM] = timeLow.split(':').map(Number);
          let [highH, highM] = timeHigh.split(':').map(Number);
          let lowMins = lowH * 60 + lowM;
          let highMins = highH * 60 + highM;
          if (mins24 >= lowMins && mins24 <= highMins) {
            // Try to book
            let container = el.closest('tr, .tee-time-item, .reservation-row, div');
            let bookBtn = container ? Array.from(container.querySelectorAll("button,input")).find(b =>
              /book|reserve|view/i.test(b.textContent || b.value)) : null;
            if (bookBtn && !found) {
              bookBtn.click();
              found = true;

              // Sr. Park Holder selection
              setTimeout(() => {
                let sel = document.querySelector('select.playerType');
                if (sel) {
                  sel.value = 'SrParkPassholder';
                  sel.dispatchEvent(new Event('change', { bubbles: true }));
                }
                let continueBtn = Array.from(document.querySelectorAll('button,input')).find(b =>
                  /continue|next|confirm/i.test(b.textContent || b.value));
                if (continueBtn) continueBtn.click();

                setTimeout(playBeep, 1000); // Success!
                running = false;
                clearInterval(monitorTimer);
                setStatus("Reservation booked and beep played.");
              }, 1200);

            }
          }
        }
      });
      if (!found) setStatus("No matching reservations found. Retrying in 30 sec.");
    }, 1800);
  }
  afterLoadActions();
}

// ========================== MONITOR CONTROL BUTTONS ==========================
document.getElementById('tt-start-btn').onclick = function() {
  if (running) return;
  running = true;
  setStatus("Monitoring started...");
  performMonitorCycle();
  monitorTimer = setInterval(() => {
    if (running) performMonitorCycle();
  }, 30000);
  this.style.display = "none";
  document.getElementById('tt-stop-btn').style.display = "";
};
document.getElementById('tt-stop-btn').onclick = function() {
  running = false;
  clearInterval(monitorTimer);
  setStatus("Monitoring stopped.");
  this.style.display = "none";
  document.getElementById('tt-start-btn').style.display = "";
};

