const app = document.querySelector("#app");
      const state = {
        token: localStorage.getItem("robogo-token"),
        user: null,
        flash: "",
        studentNotice: "",
        studentView: "lesson",
        teacherView: "overview",
        editingMaterialId: null,
        editingStudentId: null,
        editingClassId: null,
        editingStepId: null,
        selectedMaterialId: null,
        materialSteps: null,
        attendanceData: null,
        selectedAttendanceSessionId: null,
        selectedEngineeringTeamId: null,
        selectedEngineeringNoteId: null,
        engineeringNoticeError: false,
      };

      const teacherSeed = {
        email: "teacher@robogo.local",
        password: "Teacher123!"
      };
      const studentSeed = {
        email: "student@robogo.local",
        password: "Student123!"
      };
      const weekdayOptions = [
        { value: 0, label: "Monday" },
        { value: 1, label: "Tuesday" },
        { value: 2, label: "Wednesday" },
        { value: 3, label: "Thursday" },
        { value: 4, label: "Friday" },
        { value: 5, label: "Saturday" },
        { value: 6, label: "Sunday" }
      ];

      async function api(path, options = {}) {
        const isFormData = options.body instanceof FormData;
        const response = await fetch(path, {
          ...options,
          headers: {
            ...(isFormData ? {} : { "Content-Type": "application/json" }),
            ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
            ...(options.headers || {})
          }
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || payload.detail || "Request failed.");
        }
        return payload;
      }

      function escapeHTML(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      }

      function materialAcceptValue(fileType) {
        switch (fileType) {
          case "pdf":
            return ".pdf,application/pdf";
          case "ppt":
            return ".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation";
          case "image":
            return "image/*";
          case "video":
            return "video/*";
          default:
            return "";
        }
      }

      function syncMaterialFileAccept() {
        const fileType = document.querySelector("#material-type")?.value || "other";
        const fileInput = document.querySelector("#material-file");
        if (fileInput) {
          fileInput.accept = materialAcceptValue(fileType);
        }
      }

      function showFileInfo() {
        const fileInput = document.querySelector("#material-file");
        const infoEl = document.querySelector("#file-info");
        if (!fileInput || !infoEl) return;
        const file = fileInput.files?.[0];
        if (file) {
          const size = file.size < 1024 * 1024
            ? `${(file.size / 1024).toFixed(0)} KB`
            : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
          infoEl.textContent = `Selected: ${file.name} (${size})`;
        } else {
          infoEl.textContent = "";
        }
      }

      function extractDownloadFilename(headerValue, fallbackName) {
        if (!headerValue) return fallbackName;
        const utfMatch = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
        if (utfMatch) return decodeURIComponent(utfMatch[1]);
        const simpleMatch = headerValue.match(/filename=\"?([^\";]+)\"?/i);
        if (simpleMatch) return simpleMatch[1];
        return fallbackName;
      }

      function closeMaterialPreview() {
        const existing = document.querySelector(".material-preview-overlay");
        if (existing?.dataset.objectUrl) {
          URL.revokeObjectURL(existing.dataset.objectUrl);
        }
        if (existing) existing.remove();
      }

      function showSlidePreview(manifest, title) {
        closeMaterialPreview();
        let currentPage = 0;
        const pages = manifest.pages;
        const token = state.token || "";

        const imgEls = {};
        const thumbUrls = {};

        function loadPage(idx) {
          const img = imgEls[idx];
          if (!img) return;
          if (!thumbUrls[idx]) {
            fetch(pages[idx].url, {
              headers: token ? { Authorization: `Bearer ${token}` } : {}
            })
              .then(r => r.blob())
              .then(blob => {
                const url = URL.createObjectURL(blob);
                thumbUrls[idx] = url;
                img.src = url;
              });
          } else {
            img.src = thumbUrls[idx];
          }
          document.querySelectorAll(".slide-thumb").forEach(el => el.classList.remove("active"));
          const activeThumb = document.querySelector(`#slide-thumb-${idx}`);
          if (activeThumb) activeThumb.classList.add("active");
          document.querySelector("#slide-indicator").textContent = `${idx + 1} / ${pages.length}`;
        }

        const overlay = document.createElement("div");
        overlay.className = "material-preview-overlay";
        overlay.style.cssText = "position:fixed;inset:0;z-index:1000;background:#0f0f0f;display:flex;";
        overlay.addEventListener("click", (e) => {
          if (e.target === overlay) closeMaterialPreview();
        });

        const thumbsHTML = pages.map((p, i) => `
          <div id="slide-thumb-${i}" class="slide-thumb" style="cursor:pointer;padding:4px;border:2px solid transparent;border-radius:4px;margin-bottom:4px;transition:border-color 0.2s;"
               onclick="event.stopPropagation();">
            <img src="${p.thumbnailUrl || ''}" style="width:100%;height:auto;display:block;border-radius:2px;background:#1a1a1a;min-height:60px;"
                 onerror="this.style.background='#333'" loading="lazy" />
            <div style="text-align:center;font-size:11px;color:#999;margin-top:2px;">${i + 1}</div>
          </div>
        `).join("");

        overlay.innerHTML = `
          <button id="slide-close-btn" style="position:absolute;top:12px;right:16px;color:#fff;background:rgba(255,255,255,0.1);border:none;font-size:24px;cursor:pointer;z-index:20;width:36px;height:36px;border-radius:50%;">✕</button>
          <div style="display:flex;width:100%;height:100%;">
            <div id="slide-sidebar" style="width:180px;min-width:180px;background:#1a1a1a;overflow-y:auto;padding:12px 8px;border-right:1px solid #333;">
              <div style="color:#aaa;font-size:12px;margin-bottom:8px;padding:0 4px;">${title}</div>
              ${thumbsHTML}
            </div>
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;">
              <div id="slide-indicator" style="position:absolute;top:16px;left:50%;transform:translateX(-50%);color:#aaa;font-size:13px;background:rgba(0,0,0,0.6);padding:4px 12px;border-radius:12px;z-index:10;"></div>
              <div style="display:flex;align-items:center;gap:12px;max-width:calc(100% - 32px);max-height:calc(100vh - 32px);">
                <button id="slide-prev-btn" style="color:#fff;background:rgba(255,255,255,0.08);border:none;font-size:28px;padding:16px 10px;cursor:pointer;border-radius:4px;transition:background 0.2s;flex-shrink:0;">◀</button>
                <div style="flex:1;display:flex;align-items:center;justify-content:center;max-height:calc(100vh - 40px);">
                  <img id="slide-main-img" src="" style="max-height:calc(100vh - 40px);max-width:100%;object-fit:contain;border-radius:4px;user-select:none;-webkit-user-drag:none;" oncontextmenu="return false" draggable="false" />
                </div>
                <button id="slide-next-btn" style="color:#fff;background:rgba(255,255,255,0.08);border:none;font-size:28px;padding:16px 10px;cursor:pointer;border-radius:4px;transition:background 0.2s;flex-shrink:0;">▶</button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(overlay);

        // 缩略图点击
        document.querySelectorAll(".slide-thumb").forEach((el, i) => {
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            currentPage = i;
            loadPage(currentPage);
          });
        });

        document.querySelector("#slide-close-btn").addEventListener("click", closeMaterialPreview);
        document.querySelector("#slide-prev-btn").addEventListener("click", () => {
          currentPage = Math.max(0, currentPage - 1);
          loadPage(currentPage);
          document.querySelector("#slide-sidebar").querySelector(`#slide-thumb-${currentPage}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
        document.querySelector("#slide-next-btn").addEventListener("click", () => {
          currentPage = Math.min(pages.length - 1, currentPage + 1);
          loadPage(currentPage);
          document.querySelector("#slide-sidebar").querySelector(`#slide-thumb-${currentPage}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
        document.addEventListener("keydown", function navKeys(e) {
          if (e.key === "Escape") { closeMaterialPreview(); return; }
          if (e.key === "ArrowLeft") { currentPage = Math.max(0, currentPage - 1); loadPage(currentPage); }
          if (e.key === "ArrowRight") { currentPage = Math.min(pages.length - 1, currentPage + 1); loadPage(currentPage); }
        });

        imgEls[0] = document.querySelector("#slide-main-img");
        // 为每页复用主图元素，通过更新 src 切换
        for (let i = 0; i < pages.length; i++) {
          imgEls[i] = imgEls[0];
        }

        loadPage(0);
      }

      function showMaterialPreview(objectUrl, filename, mimeType, htmlContent) {
        closeMaterialPreview();

        let previewUrl = objectUrl;
        if (htmlContent) {
          const htmlBlob = new Blob([htmlContent], { type: "text/html" });
          previewUrl = URL.createObjectURL(htmlBlob);
        }

        let bodyMarkup = `
          <iframe
            src="${previewUrl}"
            title="${filename.replace(/"/g, "&quot;")}"
            style="width:100%;height:100%;border:0;background:#fff;"
          ></iframe>
        `;

        if (mimeType.startsWith("image/")) {
          bodyMarkup = `
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#0f172a;">
              <img src="${objectUrl}" alt="${filename.replace(/"/g, "&quot;")}" style="max-width:100%;max-height:100%;object-fit:contain;" />
            </div>
          `;
        } else if (mimeType.startsWith("video/")) {
          bodyMarkup = `
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#000;">
              <video src="${objectUrl}" controls style="max-width:100%;max-height:100%;"></video>
            </div>
          `;
        } else if (mimeType.startsWith("audio/")) {
          bodyMarkup = `
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#fff;">
              <audio src="${objectUrl}" controls style="width:min(720px,90%);"></audio>
            </div>
          `;
        }

        const overlay = document.createElement("div");
        overlay.className = "material-preview-overlay";
        overlay.dataset.objectUrl = previewUrl;
        overlay.style.cssText = "position:fixed;inset:0;z-index:1000;background:rgba(15,23,42,0.72);display:flex;align-items:center;justify-content:center;padding:24px;";
        overlay.innerHTML = `
          <div style="width:min(1200px,96vw);height:min(860px,92vh);background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 24px 80px rgba(15,23,42,0.35);display:flex;flex-direction:column;">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #dbe3ef;background:#f8fafc;gap:12px;">
              <strong style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${filename.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</strong>
              <div style="display:flex;gap:8px;align-items:center;">
                <a href="${previewUrl}" target="_blank" rel="noopener noreferrer" style="font-size:13px;color:#0f5d78;text-decoration:none;">Open in new tab</a>
                <button type="button" class="button secondary material-preview-close" style="min-height:34px;">Close</button>
              </div>
            </div>
            <div style="flex:1;min-height:0;background:#e5eef5;">
              ${bodyMarkup}
            </div>
          </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener("click", (event) => {
          if (event.target === overlay) closeMaterialPreview();
        });
        overlay.querySelector(".material-preview-close")?.addEventListener("click", closeMaterialPreview);
      }

      async function openMaterialFile(downloadUrl, fallbackName, isLink, previewUrl) {
        if (isLink) {
          window.open(downloadUrl, "_blank");
          return;
        }
        if (previewUrl) {
          const previewResponse = await fetch(previewUrl, {
            headers: {
              ...(state.token ? { Authorization: `Bearer ${state.token}` } : {})
            }
          });
          if (!previewResponse.ok) {
            let message = "Preview could not be loaded.";
            try {
              const payload = await previewResponse.json();
              message = payload.error || payload.detail || message;
            } catch { /* ignore */ }
            throw new Error(message);
          }
          const manifest = await previewResponse.json();
          if (manifest.pages && manifest.pages.length > 0) {
            showSlidePreview(manifest, fallbackName);
            return;
          }
          throw new Error("No preview pages available.");
        }
        const response = await fetch(downloadUrl, {
          headers: {
            ...(state.token ? { Authorization: `Bearer ${state.token}` } : {})
          }
        });

        if (!response.ok) {
          let message = "Material file could not be loaded.";
          try {
            const payload = await response.json();
            message = payload.error || payload.detail || message;
          } catch {
            // Ignore non-JSON error bodies.
          }
          throw new Error(message);
        }

        const blob = await response.blob();
        const filename = extractDownloadFilename(response.headers.get("Content-Disposition"), fallbackName);
        const objectUrl = URL.createObjectURL(blob);
        showMaterialPreview(objectUrl, filename, blob.type || "application/octet-stream", "");
      }

      function routeTo(path) {
        window.history.pushState({}, "", path);
        render();
      }

      function signOut() {
        localStorage.removeItem("robogo-token");
        state.token = null;
        state.user = null;
        state.flash = "";
        routeTo("/");
      }

      async function login(email, password) {
        const payload = await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password })
        });
        state.token = payload.token;
        state.user = payload.user;
        localStorage.setItem("robogo-token", state.token);
        routeTo(payload.user.role === "Teacher" ? "/teacher" : "/student");
      }

      function renderLogin(message = "") {
        app.innerHTML = `
          <main class="login-shell">
            <section class="brand-panel">
              <div>
                <div class="brand-mark">RoBoGo</div>
                <p>Build a steady classroom rhythm for VEX IQ sessions, lesson access, and attendance-ready learning workflows.</p>
              </div>
              <p>Teacher Dashboard now includes student, class, and session setup for the next MVP step.</p>
            </section>
            <section class="login-panel">
              <form id="login-form" class="login-card">
                <h1>RoBoGo Learning Portal</h1>
                <p class="muted">Sign in to continue.</p>
                <label for="email">Email</label>
                <input id="email" name="email" type="email" autocomplete="email" required />
                <label for="password">Password</label>
                <input id="password" name="password" type="password" autocomplete="current-password" required />
                <div class="button-row">
                  <button class="button" type="submit">Sign in</button>
                  <button class="button secondary" type="button" id="teacher-demo">Teacher demo</button>
                  <button class="button secondary" type="button" id="student-demo">Student demo</button>
                </div>
                ${message ? `<p class="error">${message}</p>` : ""}
              </form>
            </section>
          </main>
        `;

        document.querySelector("#login-form").addEventListener("submit", async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          try {
            await login(form.get("email"), form.get("password"));
          } catch (error) {
            renderLogin(error.message);
          }
        });
        document.querySelector("#teacher-demo").addEventListener("click", () => {
          document.querySelector("#email").value = teacherSeed.email;
          document.querySelector("#password").value = teacherSeed.password;
        });
        document.querySelector("#student-demo").addEventListener("click", () => {
          document.querySelector("#email").value = studentSeed.email;
          document.querySelector("#password").value = studentSeed.password;
        });
      }

      function bannerMarkup() {
        if (!state.flash) return "";
        return `<div class="banner success">${state.flash}</div>`;
      }

      function studentBannerMarkup() {
        if (!state.studentNotice) return "";
        return `<div class="banner success">${state.studentNotice}</div>`;
      }

      function studentMaterialCards(materials, emptyMessage, source) {
        return materials.length ? materials.map((material) => `
          <article class="material-card">
            <header>
              <div>
                <strong>${material.title}</strong>
                <div class="material-meta">${material.className} • ${material.sessionDate} • ${material.startTime}-${material.endTime}</div>
              </div>
              <span class="pill">${material.assignmentScope === "student" ? "Personal" : "Class"}</span>
            </header>
            <p class="muted">${material.description || "No material description yet."}</p>
            <div class="button-row">
              <button
                class="button open-material"
                type="button"
                data-material-id="${material.id}"
                data-material-title="${material.title}"
                data-source="${source}"
                data-session-id="${material.classSessionId || ""}"
                data-download-url="${material.downloadUrl || ""}"
                data-is-link="${material.isLink ? "true" : "false"}"
                data-preview-url="${material.previewUrl || ""}"
              >
                ${source === "current_lesson" ? "Open & Check In" : "Open material"}
              </button>
              <span class="pill">${material.fileType || "Attachment"}</span>
            </div>
          </article>
        `).join("") : `<div class="empty-state">${emptyMessage}</div>`;
      }

      function renderStudentPortal(data) {
        if (state.studentView === "engineering") {
          loadStudentEngineeringNotebook().then(renderStudentEngineeringNotebook).catch((error) => {
            renderStudentEngineeringNotebook({ teams: [], sessions: [], notes: [], proposals: [], publishedEntries: [], error: error.message });
          });
          return;
        }
        if (state.studentView === "schedule") {
          loadStudentSchedule().then(renderStudentScheduleView).catch(() => {
            renderStudentScheduleView({ schedule: [], studentName: data.studentName });
          });
          return;
        }
        if (state.studentView === "attendance") {
          loadStudentAttendance().then(renderStudentAttendanceView).catch(() => {
            renderStudentAttendanceView({ attendance: [], studentName: data.studentName });
          });
          return;
        }
        if (state.studentView === "review") {
          renderStudentReviewView(data);
          return;
        }
        renderStudentLessonView(data);
      }

      let classroomPollTimer = null;

      function startClassroomPolling() {
        stopClassroomPolling();
        classroomPollTimer = setInterval(async () => {
          try {
            const data = await api("/api/student/current-lesson");
            if (state.studentView === "lesson") {
              const oldPhase = state._lastClassroomPhase || "";
              const newPhase = data.classroomPhase || "not_started";
              if (oldPhase !== newPhase) {
                state._lastClassroomPhase = newPhase;
                renderStudentLessonView(data);
              }
            }
          } catch {
            // Silently ignore polling errors
          }
        }, 5000);
      }

      function stopClassroomPolling() {
        if (classroomPollTimer) {
          clearInterval(classroomPollTimer);
          classroomPollTimer = null;
        }
      }

      function renderStudentLessonView(data) {
        stopClassroomPolling();
        const currentSession = data.currentSession;
        if (currentSession) {
          renderClassroomView(data, currentSession);
          startClassroomPolling();
        } else {
          renderNoClassroomView(data);
        }
      }

      function renderClassroomView(data, session) {
        const phase = data.classroomPhase || "not_started";
        state._lastClassroomPhase = phase;
        const phaseNames = { not_started: "Waiting", theory: "Theory", building: "Building" };
        const phaseOrder = ["not_started", "theory", "building"];
        const currentIdx = phaseOrder.indexOf(phase);

        app.innerHTML = `
          <main class="portal-shell">
            <aside class="sidebar">
              <div class="sidebar-title">Student Portal</div>
              <nav class="nav-list">
                <a class="nav-item active" href="#" data-view="lesson">Classroom</a>
                <a class="nav-item" href="#" data-view="schedule">Schedule</a>
                <a class="nav-item" href="#" data-view="review">Review</a>
                <a class="nav-item" href="#" data-view="attendance">Attendance</a>
                <a class="nav-item" href="#" data-view="engineering">Engineering Notebook</a>
              </nav>

            </aside>
            <section class="content">
              <div class="topbar">
                <div>
                  <h1>🏫 Classroom</h1>
                  <p class="muted">${data.welcome}</p>
                </div>
                <div class="button-row">
                  <span class="badge">${state.user.role}</span>
                  <button class="button secondary" id="sign-out" type="button">Sign out</button>
                </div>
              </div>

              <div class="classroom-header">
                <h1>${session.className}</h1>
                <div class="session-meta">${session.sessionDate} • ${session.startTime}–${session.endTime} ${session.title ? ` • ${session.title}` : ""}</div>
              </div>

              ${renderPhaseIndicator(currentIdx, phaseOrder)}

              <section class="surface" style="margin-bottom:16px;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                  <strong style="font-size:18px;">${phaseNames[phase]} Phase</strong>
                  ${data.attendanceCheckedIn
                    ? `<span class="badge" style="background:#eaf6ef;color:var(--ok);">✅ Checked in</span>`
                    : (phase !== "not_started"
                      ? `<span class="badge" style="background:#fbe9e5;color:var(--accent);">⚠️ Not checked in</span>`
                      : "")}
                </div>
                ${studentBannerMarkup()}
                ${renderPhaseContent(data, phase)}
              </section>

              <div class="polling-status">Auto-refreshing every 5s</div>
            </section>
          </main>
        `;

        document.querySelector("#sign-out").addEventListener("click", signOut);
        document.querySelectorAll("[data-view]").forEach((item) => {
          item.addEventListener("click", (e) => {
            e.preventDefault();
            stopClassroomPolling();
            handleStudentNavClick(item.dataset.view);
          });
        });
        document.querySelectorAll(".open-material").forEach((button) => {
          button.addEventListener("click", () => handleOpenMaterial(button.dataset));
        });
        const pwdForm = document.querySelector("#student-password-form");
        if (pwdForm) {
          pwdForm.addEventListener("submit", handleStudentPasswordChange);
        }
      }

      function renderPhaseIndicator(currentIdx, phaseOrder) {
        const labels = ["Waiting", "Theory", "Building"];
        return `
          <div class="phase-indicator">
            ${phaseOrder.map((p, idx) => {
              let dotClass = "";
              let lineClass = "";
              if (idx < currentIdx) { dotClass = "done"; lineClass = "done"; }
              else if (idx === currentIdx) { dotClass = "active"; lineClass = idx > 0 ? "active" : ""; }
              const num = idx < currentIdx ? "✓" : (idx + 1);
              let html = `<div class="phase-step"><span class="phase-dot ${dotClass}">${num}</span>`;
              if (idx < phaseOrder.length - 1) {
                html += `<span class="phase-line ${lineClass}"></span>`;
              }
              html += `</div>`;
              return html;
            }).join("")}
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:4px;padding:0 4px;">
            ${labels.map((label, idx) => {
              const labelClass = idx === currentIdx ? "phase-label active" : "phase-label";
              return `<span class="${labelClass}">${label}</span>`;
            }).join("")}
          </div>
        `;
      }

      function renderPhaseContent(data, phase) {
        if (phase === "not_started") {
          const materials = data.currentMaterials || [];
          return `
            <div class="classroom-waiting">
              <div><span class="pulse"></span> Waiting for the teacher to start the class...</div>
              <p style="margin-top:16px;">The class will begin when your teacher starts the first phase.</p>
              ${!data.attendanceCheckedIn ? `<p style="margin-top:12px;font-size:14px;color:var(--accent);">📍 When the class starts, open a material to check in with location verification.</p>` : ""}
              ${materials.length ? `
                <div style="margin-top:20px;text-align:left;max-width:480px;margin-left:auto;margin-right:auto;">
                  <p class="muted" style="margin-bottom:8px;">📋 Today's materials (unlocked when class starts):</p>
                  ${materials.map((m) => `
                    <div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:14px;">
                      <span style="flex:1;">${m.title}</span>
                      <span class="pill">${m.fileType}</span>
                    </div>
                  `).join("")}
                </div>
              ` : ""}
            </div>
          `;
        }

        if (phase === "theory") {
          return `
            <div class="classroom-content">
              <h3>📖 Theory — Teacher's explanation</h3>
              <p class="muted">Your teacher is presenting the theory. You can follow along on your screen.</p>
              ${data.currentMaterials.length ? `
                <div class="material-cards" style="margin-top:14px;">
                  ${studentMaterialCards(data.currentMaterials, "", "current_lesson")}
                </div>
              ` : `<div class="empty-state" style="margin-top:14px;">The teacher hasn't shared theory materials yet.</div>`}
            </div>
          `;
        }

        if (phase === "building") {
          return `
            <div class="classroom-content">
              <h3>🔧 Building — Hands-on instructions</h3>
              <p class="muted">Follow the building instructions below. Open each material to view the steps.</p>
              ${data.currentMaterials.length ? `
                <div class="material-cards" style="margin-top:14px;">
                  ${studentMaterialCards(data.currentMaterials, "", "current_lesson")}
                </div>
              ` : `<div class="empty-state" style="margin-top:14px;">The teacher hasn't shared building materials yet.</div>`}
            </div>
          `;
        }

        return "";
      }

      function renderNoClassroomView(data) {
        app.innerHTML = `
          <main class="portal-shell">
            <aside class="sidebar">
              <div class="sidebar-title">Student Portal</div>
              <nav class="nav-list">
                <a class="nav-item active" href="#" data-view="lesson">Classroom</a>
                <a class="nav-item" href="#" data-view="schedule">Schedule</a>
                <a class="nav-item" href="#" data-view="review">Review</a>
                <a class="nav-item" href="#" data-view="attendance">Attendance</a>
                <a class="nav-item" href="#" data-view="engineering">Engineering Notebook</a>
              </nav>

            </aside>
            <section class="content">
              <div class="topbar">
                <div>
                  <h1>🏫 Classroom</h1>
                  <p class="muted">${data.welcome}</p>
                </div>
                <div class="button-row">
                  <span class="badge">${state.user.role}</span>
                  <button class="button secondary" id="sign-out" type="button">Sign out</button>
                </div>
              </div>
              <section class="surface">
                <div class="classroom-waiting">
                  <h2>No Active Session</h2>
                  <p style="margin-top:12px;">${data.status}</p>
                  <p style="margin-top:16px;color:var(--muted);">Check your <strong>Schedule</strong> for upcoming class times.</p>
                </div>
              </section>
            </section>
          </main>
        `;
        document.querySelector("#sign-out").addEventListener("click", signOut);
        document.querySelectorAll("[data-view]").forEach((item) => {
          item.addEventListener("click", (e) => {
            e.preventDefault();
            handleStudentNavClick(item.dataset.view);
          });
        });
        const pwdForm = document.querySelector("#student-password-form");
        if (pwdForm) {
          pwdForm.addEventListener("submit", handleStudentPasswordChange);
        }
      }

      function renderStudentReviewView(data) {
        app.innerHTML = `
          <main class="portal-shell">
            <aside class="sidebar">
              <div class="sidebar-title">Student Portal</div>
              <nav class="nav-list">
                <a class="nav-item" href="#" data-view="lesson">Current Lesson</a>
                <a class="nav-item" href="#" data-view="schedule">Schedule</a>
                <a class="nav-item active" href="#" data-view="review">Review</a>
                <a class="nav-item" href="#" data-view="attendance">Attendance</a>
                <a class="nav-item" href="#" data-view="engineering">Engineering Notebook</a>
              </nav>
            </aside>
            <section class="content">
              <div class="topbar">
                <div>
                  <h1>Review Materials</h1>
                  <p class="muted">${data.welcome}</p>
                </div>
                <div class="button-row">
                  <span class="badge">${state.user.role}</span>
                  <button class="button secondary" id="sign-out" type="button">Sign out</button>
                </div>
              </div>
              <section class="surface">
                <h2>Past Session Materials</h2>
                <p class="muted">Materials from completed sessions and past class times.</p>
                <div class="material-cards">
                  ${studentMaterialCards(data.reviewMaterials, "No review materials yet. Completed sessions will appear here.", "review")}
                </div>
              </section>
            </section>
          </main>
        `;
        document.querySelector("#sign-out").addEventListener("click", signOut);
        document.querySelectorAll("[data-view]").forEach((item) => {
          item.addEventListener("click", (e) => {
            e.preventDefault();
            handleStudentNavClick(item.dataset.view);
          });
        });
        document.querySelectorAll(".open-material").forEach((button) => {
          button.addEventListener("click", () => handleOpenMaterial(button.dataset));
        });
      }

      function renderStudentScheduleView(scheduleData) {
        app.innerHTML = `
          <main class="portal-shell">
            <aside class="sidebar">
              <div class="sidebar-title">Student Portal</div>
              <nav class="nav-list">
                <a class="nav-item" href="#" data-view="lesson">Current Lesson</a>
                <a class="nav-item active" href="#" data-view="schedule">Schedule</a>
                <a class="nav-item" href="#" data-view="review">Review</a>
                <a class="nav-item" href="#" data-view="attendance">Attendance</a>
                <a class="nav-item" href="#" data-view="engineering">Engineering Notebook</a>
              </nav>
            </aside>
            <section class="content">
              <div class="topbar">
                <div>
                  <h1>Schedule</h1>
                  <p class="muted">Welcome, ${scheduleData.studentName || ""}.</p>
                </div>
                <div class="button-row">
                  <span class="badge">${state.user.role}</span>
                  <button class="button secondary" id="sign-out" type="button">Sign out</button>
                </div>
              </div>
              <section class="surface">
                <h2>Upcoming Sessions</h2>
                <p class="muted">Your scheduled class sessions for the coming weeks.</p>
                ${scheduleData.schedule && scheduleData.schedule.length ? `
                  <div class="session-cards" style="margin-top:14px;">
                    ${scheduleData.schedule.map((session) => `
                      <article class="session-card">
                        <header>
                          <div>
                            <strong>${session.className}</strong>
                            <div class="session-meta">${session.sessionDate} • ${session.startTime}–${session.endTime}</div>
                          </div>
                          <span class="pill">${session.status}</span>
                        </header>
                        <p class="muted">${session.title || "Regular class session"}</p>
                      </article>
                    `).join("")}
                  </div>
                ` : `<div class="empty-state" style="margin-top:14px;">No upcoming sessions scheduled. Check back later or contact your teacher.</div>`}
              </section>
            </section>
          </main>
        `;
        document.querySelector("#sign-out").addEventListener("click", signOut);
        document.querySelectorAll("[data-view]").forEach((item) => {
          item.addEventListener("click", (e) => {
            e.preventDefault();
            handleStudentNavClick(item.dataset.view);
          });
        });
      }

      function renderStudentAttendanceView(attendanceData) {
        app.innerHTML = `
          <main class="portal-shell">
            <aside class="sidebar">
              <div class="sidebar-title">Student Portal</div>
              <nav class="nav-list">
                <a class="nav-item" href="#" data-view="lesson">Current Lesson</a>
                <a class="nav-item" href="#" data-view="schedule">Schedule</a>
                <a class="nav-item" href="#" data-view="review">Review</a>
                <a class="nav-item active" href="#" data-view="attendance">Attendance</a>
                <a class="nav-item" href="#" data-view="engineering">Engineering Notebook</a>
              </nav>
            </aside>
            <section class="content">
              <div class="topbar">
                <div>
                  <h1>Attendance History</h1>
                  <p class="muted">Welcome, ${attendanceData.studentName || ""}.</p>
                </div>
                <div class="button-row">
                  <span class="badge">${state.user.role}</span>
                  <button class="button secondary" id="sign-out" type="button">Sign out</button>
                </div>
              </div>
              <section class="surface">
                <h2>Your Check-in Records</h2>
                <p class="muted">Each record shows when you opened a lesson and your location was verified.</p>
                ${attendanceData.attendance && attendanceData.attendance.length ? `
                  <div class="attendance-section">
                    ${attendanceData.attendance.map((record) => `
                      <div class="attendance-row" style="padding:8px 0;">
                        <div style="flex:1;min-width:160px;">
                          <strong>${record.className}</strong>
                          <div class="muted">${record.sessionDate} • ${record.startTime}–${record.endTime}</div>
                        </div>
                        <span class="pill location-${record.locationStatus}">${record.locationStatus}</span>
                        <span class="muted">${new Date(record.checkedInAt).toLocaleString()}</span>
                      </div>
                    `).join("")}
                  </div>
                ` : `<div class="empty-state">No attendance records yet. Open a current lesson during class time to check in.</div>`}
              </section>
            </section>
          </main>
        `;
        document.querySelector("#sign-out").addEventListener("click", signOut);
        document.querySelectorAll("[data-view]").forEach((item) => {
          item.addEventListener("click", (e) => {
            e.preventDefault();
            handleStudentNavClick(item.dataset.view);
          });
        });
      }

      function engineeringFieldsMarkup(values = {}) {
        const value = (key) => escapeHTML(values[key] || "");
        const resolutionStatus = values.resolutionStatus || (values.problems ? "unresolved" : "no_problem");
        const hasOptionalEvidence = Boolean(values.alternatives || values.testEvidence);
        return `
          <div style="display:flex;align-items:center;gap:10px;margin-top:18px;"><span class="pill">1 · Plan</span><strong>What were you trying to achieve?</strong></div>
          <label>Objective *</label>
          <p class="muted" style="margin:0 0 8px;">One or two sentences is enough.</p>
          <textarea name="objective" required placeholder="Example: Make the robot pick up two game objects without dropping them.">${value("objective")}</textarea>

          <div style="display:flex;align-items:center;gap:10px;margin-top:24px;"><span class="pill">2 · Build</span><strong>What did you personally contribute?</strong></div>
          <label>What did you do? *</label>
          <textarea name="work_completed" required placeholder="Example: I rebuilt the arm and moved its pivot point one hole lower.">${value("workCompleted")}</textarea>
          <label>Why did you do it this way? *</label>
          <textarea name="reasoning" required placeholder="Example: We wanted the arm to stay lower and make the robot more stable.">${value("reasoning")}</textarea>

          <div style="display:flex;align-items:center;gap:10px;margin-top:24px;"><span class="pill">3 · Test</span><strong>What happened?</strong></div>
          <label>Result *</label>
          <p class="muted" style="margin:0 0 8px;">Include a number or observation when you can.</p>
          <textarea name="outcome" required placeholder="Example: It picked up 2 out of 3 objects and completed the run in 18 seconds.">${value("outcome")}</textarea>

          <details class="engineering-optional" ${hasOptionalEvidence ? "open" : ""} style="margin-top:18px;border:1px solid rgba(40,38,34,.12);border-radius:12px;padding:12px 14px;">
            <summary style="cursor:pointer;font-weight:700;">Add other ideas or test evidence <span class="muted">(optional)</span></summary>
            <label>Other ideas we considered</label>
            <p class="muted" style="margin:0 0 8px;">What else did you think about or try before choosing this idea?</p>
            <textarea name="alternatives" placeholder="Example: We also tried a longer arm, but it made the robot tip forward.">${value("alternatives")}</textarea>
            <label>How did you test it?</label>
            <textarea name="test_evidence" placeholder="Describe the test, conditions, measurements, photos, or sketches that show what happened.">${value("testEvidence")}</textarea>
          </details>

          <div style="display:flex;align-items:center;gap:10px;margin-top:24px;"><span class="pill">4 · Reflect</span><strong>Problems and next step</strong></div>
          <label>Did you find a problem? *</label>
          <select name="resolution_status" required>
            <option value="no_problem" ${resolutionStatus === "no_problem" ? "selected" : ""}>No problem found</option>
            <option value="unresolved" ${resolutionStatus === "unresolved" ? "selected" : ""}>Yes — not solved yet</option>
            <option value="partially_resolved" ${resolutionStatus === "partially_resolved" ? "selected" : ""}>Yes — partly solved</option>
            <option value="resolved" ${resolutionStatus === "resolved" ? "selected" : ""}>Yes — solved</option>
          </select>
          <div class="engineering-problem-fields" ${resolutionStatus === "no_problem" ? "hidden" : ""}>
            <label>What problem did you find? *</label>
            <textarea name="problems" placeholder="Describe what did not work or what surprised you.">${value("problems")}</textarea>
            <div class="engineering-resolution-field" ${resolutionStatus === "unresolved" ? "hidden" : ""}>
              <label>What did you change or try?</label>
              <textarea name="resolution" placeholder="Explain what you changed and whether it helped.">${value("resolution")}</textarea>
            </div>
            <div class="engineering-unresolved-field" ${resolutionStatus === "resolved" ? "hidden" : ""}>
              <label>What still needs to be solved?</label>
              <textarea name="unresolved_reason" placeholder="Explain why it is not solved yet and what is getting in the way.">${value("unresolvedReason")}</textarea>
            </div>
          </div>
          <label>What will you do next? *</label>
          <textarea name="next_steps" required placeholder="Example: Next lesson we will shorten the arm and test it five times.">${value("nextSteps")}</textarea>
        `;
      }

      function setupEngineeringFormUX(form) {
        if (!form) return;
        const status = form.querySelector('[name="resolution_status"]');
        const problemFields = form.querySelector(".engineering-problem-fields");
        const problems = form.querySelector('[name="problems"]');
        const resolutionField = form.querySelector(".engineering-resolution-field");
        const resolution = form.querySelector('[name="resolution"]');
        const unresolvedField = form.querySelector(".engineering-unresolved-field");
        const unresolvedReason = form.querySelector('[name="unresolved_reason"]');
        const update = () => {
          const selected = status.value;
          const hasProblem = selected !== "no_problem";
          problemFields.hidden = !hasProblem;
          problems.required = hasProblem;
          resolutionField.hidden = selected === "unresolved" || selected === "no_problem";
          unresolvedField.hidden = selected === "resolved" || selected === "no_problem";
          resolution.required = selected === "resolved";
          unresolvedReason.required = selected === "unresolved";
        };
        status.addEventListener("change", update);
        update();
      }

      function engineeringPayloadFromForm(form) {
        const data = new FormData(form);
        const resolutionStatus = data.get("resolution_status") || "no_problem";
        return {
          team_id: data.get("team_id"),
          objective: data.get("objective") || "",
          work_completed: data.get("work_completed") || "",
          reasoning: data.get("reasoning") || "",
          alternatives: data.get("alternatives") || "",
          test_evidence: data.get("test_evidence") || "",
          outcome: data.get("outcome") || "",
          problems: resolutionStatus === "no_problem" ? "" : (data.get("problems") || ""),
          resolution_status: resolutionStatus,
          resolution: resolutionStatus === "no_problem" ? "" : (data.get("resolution") || ""),
          unresolved_reason: resolutionStatus === "no_problem" ? "" : (data.get("unresolved_reason") || ""),
          next_steps: data.get("next_steps") || "",
        };
      }

      function engineeringEntryDetails(entry) {
        const rows = [
          ["Objective", entry.objective], ["Work completed", entry.workCompleted],
          ["Reasoning", entry.reasoning], ["Alternatives", entry.alternatives],
          ["Test evidence", entry.testEvidence], ["Outcome", entry.outcome],
          ["Problems", entry.problems], ["Resolution", entry.resolution],
          ["Unresolved reason", entry.unresolvedReason], ["Next steps", entry.nextSteps],
        ].filter(([, content]) => content);
        return rows.map(([label, content]) => `
          <div style="margin-top:10px;"><strong>${label}</strong><div class="muted" style="white-space:pre-wrap;">${escapeHTML(content)}</div></div>
        `).join("");
      }

      async function downloadEngineeringNotebook(teamId, teamNumber) {
        const response = await fetch(`/api/engineering-teams/${teamId}/notebook.pdf`, {
          headers: { Authorization: `Bearer ${state.token}` },
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.detail || "Engineering notebook could not be downloaded.");
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${teamNumber}-engineering-notebook.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      }

      async function downloadEngineeringAttachment(url, fileName) {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${state.token}` } });
        if (!response.ok) throw new Error("Evidence file could not be downloaded.");
        const objectUrl = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(objectUrl);
      }

      function renderStudentEngineeringNotebook(data) {
        stopClassroomPolling();
        const teams = data.teams || [];
        if (!state.selectedEngineeringTeamId || !teams.some((team) => team.id === state.selectedEngineeringTeamId)) {
          state.selectedEngineeringTeamId = teams[0]?.id || null;
        }
        const team = teams.find((item) => item.id === state.selectedEngineeringTeamId);
        const notes = (data.notes || []).filter((note) => note.teamId === team?.id);
        const currentRecord = notes.find((note) => note.id === state.selectedEngineeringNoteId) || null;
        const formatRecordTime = (value) => value ? new Date(value).toLocaleString() : "";
        app.innerHTML = `
          <main class="portal-shell">
            <aside class="sidebar">
              <div class="sidebar-title">Student Portal</div>
              <nav class="nav-list">
                <a class="nav-item" href="#" data-view="lesson">Current Lesson</a>
                <a class="nav-item" href="#" data-view="schedule">Schedule</a>
                <a class="nav-item" href="#" data-view="review">Review</a>
                <a class="nav-item" href="#" data-view="attendance">Attendance</a>
                <a class="nav-item active" href="#" data-view="engineering">Engineering Notebook</a>
              </nav>
            </aside>
            <section class="content">
              <div class="topbar">
                <div><h1>Engineering Notebook</h1><p class="muted">Student-authored records. RoBoGo does not rewrite or improve your content.</p></div>
                <div class="button-row"><span class="badge">${state.user.role}</span><button class="button secondary" id="sign-out" type="button">Sign out</button></div>
              </div>
              ${data.error ? `<div class="banner error">${escapeHTML(data.error)}</div>` : ""}
              ${state.studentNotice ? `<div class="banner ${state.engineeringNoticeError ? "error" : "success"}">${escapeHTML(state.studentNotice)}</div>` : ""}
              ${!team ? `<section class="surface"><div class="empty-state">Your teacher has not assigned you to a competition team yet.</div></section>` : `
                <section class="surface">
                  <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;">
                    <div><h2 style="margin:0;">${escapeHTML(team.name)} · ${escapeHTML(team.teamNumber)}</h2><p class="muted">Season ${escapeHTML(team.season)} · ${team.members.map((member) => escapeHTML(member.studentName)).join(", ")}</p></div>
                    <div class="button-row">
                      ${teams.length > 1 ? `<select id="engineering-team-select">${teams.map((item) => `<option value="${item.id}" ${item.id === team.id ? "selected" : ""}>${escapeHTML(item.season)} · ${escapeHTML(item.teamNumber)}</option>`).join("")}</select>` : ""}
                      <button class="button secondary engineering-download" data-team-id="${team.id}" data-team-number="${escapeHTML(team.teamNumber)}" type="button">Download PDF</button>
                    </div>
                  </div>
                  ${team.exportSpec ? `<p class="muted" style="margin-top:10px;">Export standard: ${escapeHTML(team.exportSpec.competition)} ${escapeHTML(team.exportSpec.game)} · Game Manual ${escapeHTML(team.exportSpec.manualVersion)} · Notebook Rubric ${escapeHTML(team.exportSpec.rubricVersion)}</p>` : ""}
                </section>

                <section class="surface">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
                    <div><h2 style="margin:0;">${currentRecord ? "Edit Engineering Record" : "New Engineering Record"}</h2><p class="muted">Write whenever your team works. You can save more than one record each day.</p></div>
                    ${currentRecord ? `<button class="button secondary" id="engineering-new-record" type="button">+ New Record</button>` : ""}
                  </div>
                  ${team.status === "active" ? `<form id="engineering-note-form" data-note-id="${currentRecord?.id || ""}">
                    <input type="hidden" name="team_id" value="${team.id}" />
                    ${engineeringFieldsMarkup(currentRecord || {})}
                    <label>Photos, sketches, or PDF evidence (PNG/JPG/WEBP/PDF, max 10 MB each)</label>
                    <input name="attachments" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" multiple />
                    ${(currentRecord?.attachments || []).length ? `<div class="button-row" style="margin-top:10px;">${currentRecord.attachments.map((attachment) => `<button class="button secondary engineering-attachment" data-url="${attachment.downloadUrl}" data-file-name="${escapeHTML(attachment.fileName)}" type="button">Evidence: ${escapeHTML(attachment.fileName)}</button>`).join("")}</div>` : ""}
                    <div class="button-row" style="margin-top:14px;">
                      <button class="button" type="submit">Save</button>
                      ${currentRecord ? `<button class="button secondary engineering-record-status" data-note-id="${currentRecord.id}" data-status="discarded" type="button">Discard Record</button>` : ""}
                    </div>
                  </form>` : `<div class="empty-state">This team is archived. Historical records are read-only.</div>`}
                </section>

                <section class="surface"><h2>My Engineering Records</h2>
                  <p class="muted">Each item is a separate record, not a version. Open an active record to continue editing it.</p>
                  ${notes.length ? notes.map((note) => `<article class="session-card" style="margin-top:12px;opacity:${note.status === "discarded" ? ".65" : "1"};">
                    <header><div><strong>${escapeHTML(formatRecordTime(note.recordedAt))} · ${escapeHTML(note.objective)}</strong><div class="session-meta">Last saved ${escapeHTML(formatRecordTime(note.updatedAt))}</div></div><span class="pill">${escapeHTML(note.status)}</span></header>
                    <div class="button-row" style="margin-top:10px;">
                      ${note.canEdit ? `<button class="button secondary engineering-open-record" data-note-id="${note.id}" type="button">Open</button>` : ""}
                      ${note.status === "discarded" ? `<button class="button secondary engineering-record-status" data-note-id="${note.id}" data-status="active" type="button">Restore</button>` : ""}
                    </div>
                  </article>`).join("") : `<div class="empty-state">No engineering records yet. Start your first record above.</div>`}
                </section>
              `}
            </section>
          </main>`;

        document.querySelector("#sign-out").addEventListener("click", signOut);
        document.querySelectorAll("[data-view]").forEach((item) => item.addEventListener("click", (event) => { event.preventDefault(); handleStudentNavClick(item.dataset.view); }));
        document.querySelector("#engineering-team-select")?.addEventListener("change", (event) => { state.selectedEngineeringTeamId = event.target.value; state.selectedEngineeringNoteId = null; renderStudentEngineeringNotebook(data); });
        document.querySelector("#engineering-new-record")?.addEventListener("click", () => { state.selectedEngineeringNoteId = null; renderStudentEngineeringNotebook(data); });
        document.querySelectorAll(".engineering-open-record").forEach((button) => button.addEventListener("click", () => { state.selectedEngineeringNoteId = button.dataset.noteId; renderStudentEngineeringNotebook(data); }));
        document.querySelector("#engineering-note-form")?.addEventListener("submit", handleEngineeringNoteForm);
        setupEngineeringFormUX(document.querySelector("#engineering-note-form"));
        document.querySelectorAll(".engineering-record-status").forEach((button) => button.addEventListener("click", async () => {
          try { await api(`/api/student/engineering-notes/${button.dataset.noteId}/status?status=${button.dataset.status}`, { method: "PUT" }); state.selectedEngineeringNoteId = null; await refreshStudentEngineering(button.dataset.status === "active" ? "Record restored." : "Record discarded."); }
          catch (error) { await refreshStudentEngineering(error.message, true); }
        }));
        document.querySelectorAll(".engineering-attachment").forEach((button) => button.addEventListener("click", async () => { try { await downloadEngineeringAttachment(button.dataset.url, button.dataset.fileName); } catch (error) { await refreshStudentEngineering(error.message, true); } }));
        document.querySelectorAll(".engineering-download").forEach((button) => button.addEventListener("click", async () => { try { await downloadEngineeringNotebook(button.dataset.teamId, button.dataset.teamNumber); } catch (error) { state.studentNotice = error.message; } }));
      }

      async function refreshStudentEngineering(message = "", isError = false) {
        state.studentNotice = message;
        state.engineeringNoticeError = isError;
        const workspace = await loadStudentEngineeringNotebook();
        renderStudentEngineeringNotebook(workspace);
      }

      async function handleEngineeringNoteForm(event) {
        event.preventDefault();
        const payload = engineeringPayloadFromForm(event.currentTarget);
        const attachmentFiles = Array.from(event.currentTarget.querySelector('[name="attachments"]')?.files || []);
        const noteId = event.currentTarget.dataset.noteId;
        try {
          const result = await api(noteId ? `/api/student/engineering-notes/${noteId}` : "/api/student/engineering-notes", {
            method: noteId ? "PUT" : "POST", body: JSON.stringify(payload),
          });
          for (const file of attachmentFiles) {
            const upload = new FormData();
            upload.append("file", file);
            await api(`/api/student/engineering-notes/${result.note.id}/attachments`, { method: "POST", body: upload });
          }
          state.selectedEngineeringNoteId = result.note.id;
          await refreshStudentEngineering("Record saved. You can edit it again at any time.");
        } catch (error) { await refreshStudentEngineering(error.message, true); }
      }

      async function handleEngineeringProposalForm(event) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const sourceIds = data.getAll("source_note_ids");
        if (!sourceIds.length) { state.studentNotice = "Select at least one source record."; return; }
        try {
          await api("/api/student/engineering-merge-proposals", { method: "POST", body: JSON.stringify({ ...engineeringPayloadFromForm(event.currentTarget), title: data.get("title"), source_note_ids: sourceIds }) });
          await refreshStudentEngineering("Merge proposal created. Source authors can now confirm it.");
        } catch (error) { await refreshStudentEngineering(error.message, true); }
      }

      async function handleEngineeringAction(path, message) {
        try { await api(path, { method: "POST" }); await refreshStudentEngineering(message); }
        catch (error) { await refreshStudentEngineering(error.message, true); }
      }

      function handleStudentNavClick(view) {
        state.studentView = view;
        state.studentNotice = "";
        const lessonData = view === "lesson" || view === "review" || view === "engineering"
          ? api("/api/student/current-lesson")
          : Promise.resolve({ studentName: "" });
        lessonData.then((data) => {
          state.studentNotice = "";
          renderStudentPortal(data);
        });
      }

      async function loadStudentSchedule() {
        return api("/api/student/schedule");
      }

      async function loadStudentAttendance() {
        return api("/api/student/attendance");
      }

      async function loadStudentEngineeringNotebook() {
        return api("/api/student/engineering-notebook");
      }

      async function handleStudentPasswordChange(event) {
        event.preventDefault();
        const form = new FormData(event.target);
        try {
          await api("/api/me/password", {
            method: "PUT",
            body: JSON.stringify({
              current_password: form.get("current_password"),
              new_password: form.get("new_password"),
            }),
          });
          state.studentNotice = "✅ Password updated successfully.";
          event.target.reset();
          const data = await api("/api/student/current-lesson");
          renderStudentPortal(data);
        } catch (error) {
          state.studentNotice = "";
          const data = await api("/api/student/current-lesson");
          renderStudentPortal(data);
          const secCopy = app.querySelector(".section-copy");
          if (secCopy) secCopy.insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
          const surface = app.querySelector(".surface");
          if (surface) surface.insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      function renderTeacherPortal(data) {
        if (state.teacherView !== "overview") {
          renderTeacherViewContent(data);
          return;
        }
        const studentOptions = data.students.map(
          (student) => `<option value="${student.id}">${student.displayName}</option>`
        ).join("");
        const classOptions = data.classes.map(
          (item) => `<option value="${item.id}">${item.name}</option>`
        ).join("");
        const sessionOptions = data.sessions.map(
          (session) => `<option value="${session.id}">${session.className} - ${session.sessionDate} ${session.startTime}</option>`
        ).join("");
        const materialOptions = data.materials.map(
          (material) => `<option value="${material.id}">${material.title}</option>`
        ).join("");

        app.innerHTML = `
          <main class="portal-shell">
            <aside class="sidebar">
              <div class="sidebar-title">Teacher Dashboard</div>
              <nav class="nav-list">
                <a class="nav-item active" href="#" data-view="overview">Overview</a>
                <a class="nav-item" href="#" data-view="students">Students</a>
                <a class="nav-item" href="#" data-view="classes">Classes</a>
                <a class="nav-item" href="#" data-view="sessions">Sessions</a>
                <a class="nav-item" href="#" data-view="classroom">Classroom</a>
                <a class="nav-item" href="#" data-view="materials">Material Library</a>
                <a class="nav-item" href="http://localhost:3000" target="_blank">🔧 Assembly Studio</a>
                <a class="nav-item" href="#" data-view="attendance">Attendance</a>
                <a class="nav-item" href="#" data-view="engineering">Competition</a>
              </nav>
            </aside>
            <section class="content">
              <div class="topbar">
                <div>
                  <h1>${data.title}</h1>
                  <p class="muted">${data.welcome}</p>
                </div>
                <div class="button-row">
                  <span class="badge">${state.user.role}</span>
                  <button class="button secondary" id="sign-out" type="button">Sign out</button>
                </div>
              </div>
              <section class="surface">
                <div class="section-copy">
                  <h2>Dashboard Overview</h2>
                  <p class="muted">Use the sidebar to manage students, classes, sessions, materials, and attendance.</p>
                  ${bannerMarkup()}
                </div>
                <div class="metrics-grid">
                  <article class="metric-card">
                    <strong>Students</strong>
                    <span class="metric-value">${data.summary.studentCount}</span>
                    <p class="muted">Registered student profiles ready for class assignment.</p>
                  </article>
                  <article class="metric-card">
                    <strong>Classes</strong>
                    <span class="metric-value">${data.summary.classCount}</span>
                    <p class="muted">Long-running teaching groups with a weekly schedule.</p>
                  </article>
                  <article class="metric-card">
                    <strong>Sessions</strong>
                    <span class="metric-value">${data.summary.sessionCount}</span>
                    <p class="muted">Concrete lesson occurrences generated from each class plan.</p>
                  </article>
                  <article class="metric-card">
                    <strong>Materials</strong>
                    <span class="metric-value">${data.summary.materialCount}</span>
                    <p class="muted">Reusable PDFs, slides, images, videos, or external links.</p>
                  </article>
                  <article class="metric-card">
                    <strong>Assignments</strong>
                    <span class="metric-value">${data.summary.assignmentCount}</span>
                    <p class="muted">Materials connected to class sessions or individual students.</p>
                  </article>
                </div>
                </div>
              </section>
            </section>
          </main>
        `;

        document.querySelector("#sign-out").addEventListener("click", signOut);
        document.querySelectorAll("[data-view]").forEach((item) => {
          item.addEventListener("click", (e) => {
            e.preventDefault();
            handleNavClick(item.dataset.view);
          });
        });
      }

      function renderTeacherViewContent(data) {
        const appEl = app;
        const studentOptions = data.students.map(
          (student) => `<option value="${student.id}">${student.displayName}</option>`
        ).join("");
        const classOptions = data.classes.map(
          (item) => `<option value="${item.id}">${item.name}</option>`
        ).join("");
        const sessionOptions = data.sessions.map(
          (session) => `<option value="${session.id}">${session.className} - ${session.sessionDate} ${session.startTime}</option>`
        ).join("");

        if (state.teacherView === "engineering") {
          loadTeacherEngineeringNotebooks()
            .then((workspace) => renderTeacherEngineeringView(workspace, data.students))
            .catch((error) => renderTeacherEngineeringView({ teams: [], proposals: [], publishedEntries: [], error: error.message }, data.students));
        } else if (state.teacherView === "students") {
          renderStudentsView(data, classOptions);
        } else if (state.teacherView === "classes") {
          renderClassesView(data, studentOptions);
        } else if (state.teacherView === "sessions") {
          renderSessionsView(data, classOptions);
        } else if (state.teacherView === "classroom") {
          renderTeacherClassroomView(data, sessionOptions);
        } else if (state.teacherView === "materials") {
          renderMaterialsView(data, sessionOptions);
        } else if (state.teacherView === "attendance") {
          renderAttendanceView(data, sessionOptions);
        }
      }

      async function loadTeacherEngineeringNotebooks() {
        return api("/api/teacher/engineering-notebooks");
      }

      function renderTeacherEngineeringView(workspace, students) {
        const teams = workspace.teams || [];
        const studentOptions = students.map((student) => `<option value="${student.id}">${escapeHTML(student.displayName)}</option>`).join("");
        app.innerHTML = `
          <main class="portal-shell">
            <aside class="sidebar">
              <div class="sidebar-title">Teacher Dashboard</div>
              <nav class="nav-list">
                <a class="nav-item" href="#" data-view="overview">Overview</a>
                <a class="nav-item" href="#" data-view="students">Students</a>
                <a class="nav-item" href="#" data-view="classes">Classes</a>
                <a class="nav-item" href="#" data-view="sessions">Sessions</a>
                <a class="nav-item" href="#" data-view="classroom">Classroom</a>
                <a class="nav-item" href="#" data-view="materials">Material Library</a>
                <a class="nav-item" href="http://localhost:3000" target="_blank">🔧 Assembly Studio</a>
                <a class="nav-item" href="#" data-view="attendance">Attendance</a>
                <a class="nav-item active" href="#" data-view="engineering">Competition</a>
              </nav>
            </aside>
            <section class="content">
              <div class="topbar">
                <div><h1>Competition</h1><p class="muted">Manage season teams and review student-authored Engineering Records.</p></div>
                <div class="button-row"><span class="badge">${state.user.role}</span><button class="button secondary" id="sign-out" type="button">Sign out</button></div>
              </div>
              ${workspace.error ? `<div class="banner error">${escapeHTML(workspace.error)}</div>` : ""}
              ${bannerMarkup()}
              <section class="surface">
                <h2>Create Competition Team</h2>
                <form id="engineering-team-form">
                  <div class="form-grid three">
                    <div><label>Team name *</label><input name="name" required /></div>
                    <div><label>VEX team number *</label><input name="team_number" placeholder="IQ-12345" required /></div>
                    <div><label>Season *</label><input name="season" value="2026-2027" pattern="[0-9]{4}-[0-9]{4}" required /></div>
                  </div>
                  <button class="button" style="margin-top:12px;" type="submit">Create Competition Team</button>
                </form>
                ${teams.length ? `<form id="engineering-member-form" style="margin-top:22px;padding-top:18px;border-top:1px solid var(--line);">
                  <div class="form-grid three">
                    <div><label>Team *</label><select name="team_id" required>${teams.map((team) => `<option value="${team.id}">${escapeHTML(team.season)} · ${escapeHTML(team.teamNumber)} · ${escapeHTML(team.name)}</option>`).join("")}</select></div>
                    <div><label>Student *</label><select name="student_id" required><option value="">Select student</option>${studentOptions}</select></div>
                  </div>
                  <button class="button secondary" style="margin-top:12px;" type="submit">Add Student to Team</button>
                </form>` : ""}
              </section>
              <section class="surface"><h2>Teams</h2>
                ${teams.length ? teams.map((team) => `<article class="session-card" style="margin-top:12px;">
                  <header><div><strong>${escapeHTML(team.teamNumber)} · ${escapeHTML(team.name)}</strong><div class="session-meta">${escapeHTML(team.season)} · ${escapeHTML(team.status)}</div></div><button class="button secondary teacher-engineering-download" data-team-id="${team.id}" data-team-number="${escapeHTML(team.teamNumber)}" type="button">Download PDF</button></header>
                  <form class="engineering-team-edit" data-team-id="${team.id}" style="margin-top:12px;"><div class="form-grid three"><div><label>Team name</label><input name="name" value="${escapeHTML(team.name)}" required /></div><div><label>Team number</label><input value="${escapeHTML(team.teamNumber)}" disabled /></div><div><label>Status</label><select name="status"><option value="active" ${team.status === "active" ? "selected" : ""}>Active</option><option value="archived" ${team.status === "archived" ? "selected" : ""}>Archived</option></select></div></div><button class="button secondary" style="margin-top:10px;" type="submit">Save Team</button></form>
                  <div style="margin-top:12px;">${team.members.length ? team.members.map((member) => `<span class="pill" style="margin:0 6px 6px 0;">${escapeHTML(member.studentName)} <button class="engineering-remove-member" data-team-id="${team.id}" data-student-id="${member.studentId}" type="button" aria-label="Remove ${escapeHTML(member.studentName)}" style="border:0;background:none;cursor:pointer;">×</button></span>`).join("") : "<span class=\"muted\">No students assigned.</span>"}</div>
                  ${team.exportSpec ? `<p class="muted">${escapeHTML(team.exportSpec.game)} · Manual ${escapeHTML(team.exportSpec.manualVersion)} · Rubric ${escapeHTML(team.exportSpec.rubricVersion)}</p>` : ""}
                </article>`).join("") : `<div class="empty-state">No competition teams yet.</div>`}
              </section>
              <section class="surface"><h2>Engineering Records</h2><p class="muted">Teacher view is read-only. Discarded records remain visible here and are excluded from PDF.</p>
                ${(workspace.notes || []).length ? workspace.notes.map((note) => `<details class="session-card" style="margin-top:12px;"><summary><strong>${escapeHTML(note.teamName)} · ${escapeHTML(note.authorName)} · ${escapeHTML(new Date(note.recordedAt).toLocaleString())}</strong> <span class="pill">${escapeHTML(note.status)}</span><div class="session-meta">${escapeHTML(note.objective)}</div></summary>${engineeringEntryDetails(note)}</details>`).join("") : `<div class="empty-state">No Engineering Records yet.</div>`}
              </section>
            </section>
          </main>`;
        document.querySelector("#sign-out").addEventListener("click", signOut);
        document.querySelectorAll("[data-view]").forEach((item) => item.addEventListener("click", (event) => { event.preventDefault(); handleNavClick(item.dataset.view); }));
        document.querySelector("#engineering-team-form")?.addEventListener("submit", handleEngineeringTeamCreate);
        document.querySelector("#engineering-member-form")?.addEventListener("submit", handleEngineeringMemberAdd);
        document.querySelectorAll(".engineering-team-edit").forEach((form) => form.addEventListener("submit", handleEngineeringTeamUpdate));
        document.querySelectorAll(".engineering-remove-member").forEach((button) => button.addEventListener("click", async () => { try { await api(`/api/teacher/engineering-teams/${button.dataset.teamId}/members/${button.dataset.studentId}`, { method: "DELETE" }); await refreshTeacherEngineering("Student removed from team. Historical records were preserved."); } catch (error) { await refreshTeacherEngineering(error.message); } }));
        document.querySelectorAll(".teacher-engineering-download").forEach((button) => button.addEventListener("click", async () => {
          try { await downloadEngineeringNotebook(button.dataset.teamId, button.dataset.teamNumber); }
          catch (error) { state.flash = error.message; const dashboard = await loadTeacherDashboard(); renderTeacherPortal(dashboard); }
        }));
      }

      async function refreshTeacherEngineering(message = "") {
        state.flash = message;
        const [workspace, dashboard] = await Promise.all([loadTeacherEngineeringNotebooks(), loadTeacherDashboard()]);
        renderTeacherEngineeringView(workspace, dashboard.students);
      }

      async function handleEngineeringTeamCreate(event) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await api("/api/teacher/engineering-teams", { method: "POST", body: JSON.stringify({ name: form.get("name"), team_number: form.get("team_number"), season: form.get("season") }) });
          await refreshTeacherEngineering("Competition team created.");
        } catch (error) { await refreshTeacherEngineering(error.message); }
      }

      async function handleEngineeringTeamUpdate(event) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try { await api(`/api/teacher/engineering-teams/${event.currentTarget.dataset.teamId}`, { method: "PUT", body: JSON.stringify({ name: form.get("name"), status: form.get("status") }) }); await refreshTeacherEngineering("Competition team updated."); }
        catch (error) { await refreshTeacherEngineering(error.message); }
      }

      async function handleEngineeringMemberAdd(event) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await api(`/api/teacher/engineering-teams/${form.get("team_id")}/members`, { method: "POST", body: JSON.stringify({ student_id: form.get("student_id") }) });
          await refreshTeacherEngineering("Student added to competition team.");
        } catch (error) { await refreshTeacherEngineering(error.message); }
      }

      function renderStudentsView(data, classOptions) {
        const studentOptions = data.students.map(
          (student) => `<option value="${student.id}">${student.displayName}</option>`
        ).join("");
        app.innerHTML = `
          <main class="portal-shell">
            <aside class="sidebar">
              <div class="sidebar-title">Teacher Dashboard</div>
              <nav class="nav-list">
                <a class="nav-item" href="#" data-view="overview">Overview</a>
                <a class="nav-item active" href="#" data-view="students">Students</a>
                <a class="nav-item" href="#" data-view="classes">Classes</a>
                <a class="nav-item" href="#" data-view="sessions">Sessions</a>
                <a class="nav-item" href="#" data-view="classroom">Classroom</a>
                <a class="nav-item" href="#" data-view="materials">Material Library</a>
                <a class="nav-item" href="http://localhost:3000" target="_blank">🔧 Assembly Studio</a>
                <a class="nav-item" href="#" data-view="attendance">Attendance</a>
                <a class="nav-item" href="#" data-view="engineering">Competition</a>
              </nav>
            </aside>
            <section class="content">
              <div class="topbar">
                <div>
                  <h1>Students</h1>
                  <p class="muted">Create and manage student profiles.</p>
                </div>
                <div class="button-row">
                  <span class="badge">${state.user.role}</span>
                  <button class="button secondary" id="sign-out" type="button">Sign out</button>
                </div>
              </div>
              ${bannerMarkup()}
              <section class="surface">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <h2 style="margin:0;">All Students (${data.summary.studentCount})</h2>
                  <button class="button" type="button" onclick="const s=document.getElementById('student-create-section');s.style.display=s.style.display==='none'?'block':'none';this.textContent=s.style.display==='none'?'＋ New Student':'− Cancel'">＋ New Student</button>
                </div>
                <div id="student-create-section" style="display:none;margin-top:16px;padding:16px;border:1px solid var(--line);border-radius:6px;background:#f9fbfd;">
                  <h3>Create Student</h3>
                  <form id="student-form">
                    <label for="student-display-name">Display name</label>
                    <input id="student-display-name" name="display_name" type="text" required />
                    <label for="student-email">Email (used for login)</label>
                    <input id="student-email" name="email" type="email" required />
                    <label for="student-parent-name">Parent name</label>
                    <input id="student-parent-name" name="parent_name" type="text" />
                    <label for="student-password">Password (leave empty to auto-generate)</label>
                    <input id="student-password" name="password" type="text" placeholder="Auto-generated if empty" />
                    <div class="button-row">
                      <button class="button" type="submit">Add student</button>
                    </div>
                  </form>
                </div>
              </section>
              <section class="surface" style="margin-top:20px;">
                <h2 style="margin:0;">Student List</h2>
                <div class="student-cards">
                  ${data.students.length ? data.students.map((student) => {
                    const isEditing = state.editingStudentId === student.id;
                    return `
                    <article class="student-card">
                      <header>
                        <div>
                          <strong>${student.displayName}</strong>
                          <div class="student-meta">${student.email}</div>
                        </div>
                        <span class="pill">${student.classNames.length} classes</span>
                      </header>
                      <div class="pill-list">
                        ${(student.classNames.length ? student.classNames : ["Unassigned"]).map((name) => `<span class="pill">${name}</span>`).join("")}
                      </div>
                      <div class="button-row" style="margin-top:8px;">
                        <button class="button secondary student-edit-btn" type="button" data-student-id="${student.id}" style="font-size:13px;">${isEditing ? "Cancel" : "Edit"}</button>
                      </div>
                      ${isEditing ? `
                        <form class="inline-edit-form student-edit-form" data-student-id="${student.id}">
                          <label for="edit-student-name-${student.id}">Display name</label>
                          <input id="edit-student-name-${student.id}" name="display_name" value="${student.displayName.replace(/"/g, "&quot;")}" required />
                          <label for="edit-student-email-${student.id}">Email</label>
                          <input id="edit-student-email-${student.id}" name="email" type="email" value="${student.email}" required />
                          <label for="edit-student-parent-${student.id}">Parent name</label>
                          <input id="edit-student-parent-${student.id}" name="parent_name" value="${(student.parentName || "").replace(/"/g, "&quot;")}" />
                          <label for="edit-student-pwd-${student.id}">New password (leave empty to keep current)</label>
                          <input id="edit-student-pwd-${student.id}" name="password" type="text" placeholder="Leave empty to keep current" />
                          <div class="button-row">
                            <button class="button" type="submit">Save changes</button>
                          </div>
                        </form>
                      ` : ""}
                    </article>
                  `; }).join("") : `<div class="empty-state">No students yet. Create the first one above.</div>`}
                </div>
              </section>
            </section>
          </main>
        `;
        document.querySelector("#sign-out").addEventListener("click", signOut);
        document.querySelectorAll("[data-view]").forEach((item) => {
          item.addEventListener("click", (e) => { e.preventDefault(); handleNavClick(item.dataset.view); });
        });
        document.querySelector("#student-form").addEventListener("submit", handleStudentCreate);
        document.querySelectorAll(".student-edit-btn").forEach((btn) => {
          btn.addEventListener("click", () => toggleStudentEdit(btn.dataset.studentId));
        });
        document.querySelectorAll(".student-edit-form").forEach((form) => {
          form.addEventListener("submit", (e) => handleStudentEdit(e, form.dataset.studentId));
        });
      }

      function renderClassesView(data, studentOptions) {
        const classOptions = data.classes.map(
          (item) => `<option value="${item.id}">${item.name}</option>`
        ).join("");
        app.innerHTML = `
          <main class="portal-shell">
            <aside class="sidebar">
              <div class="sidebar-title">Teacher Dashboard</div>
              <nav class="nav-list">
                <a class="nav-item" href="#" data-view="overview">Overview</a>
                <a class="nav-item" href="#" data-view="students">Students</a>
                <a class="nav-item active" href="#" data-view="classes">Classes</a>
                <a class="nav-item" href="#" data-view="sessions">Sessions</a>
                <a class="nav-item" href="#" data-view="classroom">Classroom</a>
                <a class="nav-item" href="#" data-view="materials">Material Library</a>
                <a class="nav-item" href="http://localhost:3000" target="_blank">🔧 Assembly Studio</a>
                <a class="nav-item" href="#" data-view="attendance">Attendance</a>
                <a class="nav-item" href="#" data-view="engineering">Competition</a>
              </nav>
            </aside>
            <section class="content">
              <div class="topbar">
                <div>
                  <h1>Classes</h1>
                  <p class="muted">Create teaching groups and assign students.</p>
                </div>
                <div class="button-row">
                  <span class="badge">${state.user.role}</span>
                  <button class="button secondary" id="sign-out" type="button">Sign out</button>
                </div>
              </div>
              ${bannerMarkup()}
              <section class="surface" style="margin-bottom:20px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <h2 style="margin:0;">All Classes (${data.summary.classCount})</h2>
                  <button class="button" type="button" onclick="const s=document.getElementById('class-create-section');s.style.display=s.style.display==='none'?'block':'none';this.textContent=s.style.display==='none'?'＋ New Class':'− Cancel'">＋ New Class</button>
                </div>
                <div id="class-create-section" style="display:none;margin-top:16px;">
                  <div class="form-grid">
                    <section class="form-card">
                      <h3>Create Class</h3>
                      <form id="class-form">
                    <label for="class-name">Class name</label>
                    <input id="class-name" name="name" type="text" required />
                    <label for="class-description">Description</label>
                    <textarea id="class-description" name="description"></textarea>
                    <div class="inline-fields">
                      <div>
                        <label for="class-weekday">Weekday</label>
                        <select id="class-weekday" name="weekday">
                          ${weekdayOptions.map((option) => `<option value="${option.value}">${option.label}</option>`).join("")}
                        </select>
                      </div>
                      <div>
                        <label for="class-start-time">Start time</label>
                        <input id="class-start-time" name="start_time" type="time" required value="10:00" />
                      </div>
                    </div>
                    <label for="class-end-time">End time</label>
                    <input id="class-end-time" name="end_time" type="time" required value="11:30" />
                    <div class="button-row">
                      <button class="button" type="submit">Create class</button>
                    </div>
                  </form>
                </section>
                <section class="form-card">
                  <h3>Add Student to Class</h3>
                  <form id="membership-form">
                    <label for="membership-class">Class</label>
                    <select id="membership-class" name="class_id" ${data.classes.length ? "" : "disabled"}>
                      <option value="">Select class</option>
                      ${classOptions}
                    </select>
                    <label for="membership-student">Student</label>
                    <select id="membership-student" name="student_id" ${data.students.length ? "" : "disabled"}>
                      <option value="">Select student</option>
                      ${studentOptions}
                    </select>
                    <div class="button-row">
                      <button class="button" type="submit" ${data.classes.length && data.students.length ? "" : "disabled"}>Add membership</button>
                    </div>
                  </form>
                </section>
              </div>
                </div>
              </section>
              <section class="surface">
                <h2 style="margin:0;">Class List</h2>
                <div class="class-cards">
                  ${data.classes.length ? data.classes.map((item) => {
                    const isEditing = state.editingClassId === item.id;
                    return `
                    <article class="class-card">
                      <header>
                        <div>
                          <strong>${item.name}</strong>
                          <div class="class-meta">${item.weekdayLabel} • ${item.startTime}-${item.endTime}</div>
                        </div>
                        <span class="pill">${item.memberCount} students</span>
                      </header>
                      <p class="muted">${item.description || "No description."}</p>
                      <div class="pill-list">
                        ${(item.memberNames.length ? item.memberNames : ["No members yet"]).map((name) => `<span class="pill">${name}</span>`).join("")}
                      </div>
                      <div class="button-row" style="margin-top:8px;">
                        <button class="button secondary class-edit-btn" type="button" data-class-id="${item.id}" style="font-size:13px;">${isEditing ? "Cancel" : "Edit"}</button>
                      </div>
                      ${isEditing ? `
                        <form class="inline-edit-form class-edit-form" data-class-id="${item.id}">
                          <label for="edit-class-name-${item.id}">Class name</label>
                          <input id="edit-class-name-${item.id}" name="name" value="${item.name.replace(/"/g, "&quot;")}" required />
                          <label for="edit-class-desc-${item.id}">Description</label>
                          <textarea id="edit-class-desc-${item.id}" name="description">${(item.description || "").replace(/"/g, "&quot;")}</textarea>
                          <div class="inline-fields">
                            <div>
                              <label for="edit-class-weekday-${item.id}">Weekday</label>
                              <select id="edit-class-weekday-${item.id}" name="weekday">
                                ${weekdayOptions.map((o) => `<option value="${o.value}" ${o.value === item.weekday ? "selected" : ""}>${o.label}</option>`).join("")}
                              </select>
                            </div>
                            <div>
                              <label for="edit-class-start-${item.id}">Start time</label>
                              <input id="edit-class-start-${item.id}" name="start_time" type="time" value="${item.startTime}" required />
                            </div>
                          </div>
                          <label for="edit-class-end-${item.id}">End time</label>
                          <input id="edit-class-end-${item.id}" name="end_time" type="time" value="${item.endTime}" required />
                          <div class="button-row">
                            <button class="button" type="submit">Save changes</button>
                          </div>
                        </form>
                      ` : ""}
                    </article>
                  `; }).join("") : `<div class="empty-state">No classes yet. Create one above.</div>`}
                </div>
              </section>
            </section>
          </main>
        `;
        document.querySelector("#sign-out").addEventListener("click", signOut);
        document.querySelectorAll("[data-view]").forEach((item) => {
          item.addEventListener("click", (e) => { e.preventDefault(); handleNavClick(item.dataset.view); });
        });
        document.querySelector("#class-form").addEventListener("submit", handleClassCreate);
        document.querySelector("#membership-form").addEventListener("submit", handleMembershipCreate);
        document.querySelectorAll(".class-edit-btn").forEach((btn) => {
          btn.addEventListener("click", () => toggleClassEdit(btn.dataset.classId));
        });
        document.querySelectorAll(".class-edit-form").forEach((form) => {
          form.addEventListener("submit", (e) => handleClassEdit(e, form.dataset.classId));
        });
      }

      function renderSessionsView(data, classOptions) {
        app.innerHTML = `
          <main class="portal-shell">
            <aside class="sidebar">
              <div class="sidebar-title">Teacher Dashboard</div>
              <nav class="nav-list">
                <a class="nav-item" href="#" data-view="overview">Overview</a>
                <a class="nav-item" href="#" data-view="students">Students</a>
                <a class="nav-item" href="#" data-view="classes">Classes</a>
                <a class="nav-item active" href="#" data-view="sessions">Sessions</a>
                <a class="nav-item" href="#" data-view="classroom">Classroom</a>
                <a class="nav-item" href="#" data-view="materials">Material Library</a>
                <a class="nav-item" href="http://localhost:3000" target="_blank">🔧 Assembly Studio</a>
                <a class="nav-item" href="#" data-view="attendance">Attendance</a>
                <a class="nav-item" href="#" data-view="engineering">Competition</a>
              </nav>
            </aside>
            <section class="content">
              <div class="topbar">
                <div>
                  <h1>Sessions</h1>
                  <p class="muted">Generate and manage class sessions.</p>
                </div>
                <div class="button-row">
                  <span class="badge">${state.user.role}</span>
                  <button class="button secondary" id="sign-out" type="button">Sign out</button>
                </div>
              </div>
              ${bannerMarkup()}
              <section class="surface" style="margin-bottom:20px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <h2 style="margin:0;">All Sessions (${data.summary.sessionCount})</h2>
                  <button class="button" type="button" onclick="const s=document.getElementById('sessions-generate-section');s.style.display=s.style.display==='none'?'block':'none';this.textContent=s.style.display==='none'?'＋ Generate Sessions':'− Cancel'">＋ Generate Sessions</button>
                </div>
                <div id="sessions-generate-section" style="display:none;margin-top:16px;padding:16px;border:1px solid var(--line);border-radius:6px;background:#f9fbfd;">
                  <h3>Generate Sessions</h3>
                  <form id="sessions-form">
                  <label for="session-class">Class</label>
                  <select id="session-class" name="class_id" ${data.classes.length ? "" : "disabled"}>
                    <option value="">Select class</option>
                    ${classOptions}
                  </select>
                  <div class="inline-fields">
                    <div>
                      <label for="term-start-date">Term start date</label>
                      <input id="term-start-date" name="term_start_date" type="date" required />
                    </div>
                    <div>
                      <label for="session-count">Number of sessions</label>
                      <input id="session-count" name="session_count" type="number" min="1" max="30" value="10" required />
                    </div>
                  </div>
                  <div class="button-row">
                    <button class="button" type="submit" ${data.classes.length ? "" : "disabled"}>Generate sessions</button>
                  </div>
                </form>
                </div>
              </section>
              <section class="surface" style="margin-bottom:20px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <h2 style="margin:0;">Assign Material</h2>
                  <button class="button secondary" type="button" onclick="const s=document.getElementById('assign-section');s.style.display=s.style.display==='none'?'block':'none';this.textContent=s.style.display==='none'?'＋ Expand':'− Collapse'">＋ Expand</button>
                </div>
                <div id="assign-section" style="display:none;margin-top:16px;">
                  <form id="assignment-form">
                    <label for="assignment-session">Session</label>
                    <select id="assignment-session" name="session_id" ${data.sessions.length ? "" : "disabled"}>
                      <option value="">Select session</option>
                      ${data.sessions.map((s) => `<option value="${s.id}">${s.className} - ${s.sessionDate} ${s.startTime}</option>`).join("")}
                    </select>
                    <label for="assignment-material">Material</label>
                    <select id="assignment-material" name="material_id" ${data.materials.length ? "" : "disabled"}>
                      <option value="">Select material</option>
                      ${data.materials.map((m) => `<option value="${m.id}">${m.title}</option>`).join("")}
                    </select>
                    <label for="assignment-type">Assign to</label>
                    <select id="assignment-type" name="assigned_to_type">
                      <option value="class">Whole class</option>
                      <option value="student">Individual student</option>
                    </select>
                    <label for="assignment-student">Student</label>
                    <select id="assignment-student" name="assigned_to_student_id" ${data.students.length ? "" : "disabled"}>
                      <option value="">Only needed for individual</option>
                      ${data.students.map((s) => `<option value="${s.id}">${s.displayName}</option>`).join("")}
                    </select>
                    <label for="assignment-phase">Phase</label>
                    <select id="assignment-phase" name="phase_tag">
                      <option value="both">Both (Theory + Building)</option>
                      <option value="theory">Theory only</option>
                      <option value="building">Building only</option>
                    </select>
                    <div class="button-row">
                      <button class="button" type="submit" ${data.sessions.length && data.materials.length ? "" : "disabled"}>Assign material</button>
                    </div>
                  </form>
                </div>
              </section>
              <section class="surface">
                <h2 style="margin:0;">Session List</h2>
                <div class="session-cards">
                  ${data.sessions.length ? data.sessions.map((session) => `
                    <article class="session-card">
                      <header>
                        <div>
                          <strong>${session.className}</strong>
                          <div class="session-meta">${session.sessionDate} • ${session.startTime}-${session.endTime}</div>
                        </div>
                        <div class="button-row" style="margin-top: 0;">
                          <span class="pill">${session.status}</span>
                          <span class="pill">${session.assignmentCount} materials</span>
                          <span class="pill">${session.attendanceCount} attended</span>
                          <span class="pill">${session.absentCount} absent</span>
                        </div>
                      </header>
                      <div class="button-row" style="margin-top: 0;">
                        <span class="pill">📌 ${session.phase || "not_started"}</span>
                      </div>
                      ${session.status === "scheduled" ? `
                        <div class="button-row">
                          <button class="button session-phase-btn" type="button" data-session-id="${session.id}" data-phase="theory">Start Theory</button>
                          <button class="button session-phase-btn" type="button" data-session-id="${session.id}" data-phase="building">Start Building</button>
                          <button class="button session-complete" type="button" data-session-id="${session.id}">Complete</button>
                          <button class="button danger session-cancel" type="button" data-session-id="${session.id}">Cancel</button>
                          <button class="button danger session-delete" type="button" data-session-id="${session.id}">Delete</button>
                        </div>
                      ` : ""}
                      <p class="muted">${session.title || "Generated class session"}</p>
                      <div class="pill-list">
                        ${(session.assignments.length ? session.assignments : [{ materialTitle: "No material assigned", assignedToType: "class" }]).map((assignment) => `
                          <span class="pill">${assignment.materialTitle}${assignment.assignedToStudentName ? ` - ${assignment.assignedToStudentName}` : ""}</span>
                        `).join("")}
                      </div>
                    </article>
                  `).join("") : `<div class="empty-state">No sessions yet. Generate a term plan after creating a class.</div>`}
                </div>
              </section>
            </section>
          </main>
        `;
        document.querySelector("#sign-out").addEventListener("click", signOut);
        document.querySelectorAll("[data-view]").forEach((item) => {
          item.addEventListener("click", (e) => { e.preventDefault(); handleNavClick(item.dataset.view); });
        });
        document.querySelector("#sessions-form").addEventListener("submit", handleGenerateSessions);
        document.querySelector("#assignment-form").addEventListener("submit", handleMaterialAssignment);
        document.querySelectorAll(".session-delete").forEach((button) => {
          button.addEventListener("click", () => handleDeleteSession(button.dataset.sessionId));
        });
        document.querySelectorAll(".session-complete").forEach((button) => {
          button.addEventListener("click", () => handleUpdateSessionStatus(button.dataset.sessionId, "completed"));
        });
        document.querySelectorAll(".session-cancel").forEach((button) => {
          button.addEventListener("click", () => handleUpdateSessionStatus(button.dataset.sessionId, "cancelled"));
        });
        document.querySelectorAll(".session-phase-btn").forEach((button) => {
          button.addEventListener("click", () => handleUpdateSessionPhase(button.dataset.sessionId, button.dataset.phase));
        });
      }

      function renderTeacherClassroomView(data, sessionOptions) {
        const selectedId = state.selectedAttendanceSessionId;
        app.innerHTML = `
          <main class="portal-shell">
            <aside class="sidebar">
              <div class="sidebar-title">Teacher Dashboard</div>
              <nav class="nav-list">
                <a class="nav-item" href="#" data-view="overview">Overview</a>
                <a class="nav-item" href="#" data-view="students">Students</a>
                <a class="nav-item" href="#" data-view="classes">Classes</a>
                <a class="nav-item" href="#" data-view="sessions">Sessions</a>
                <a class="nav-item active" href="#" data-view="classroom">Classroom</a>
                <a class="nav-item" href="#" data-view="materials">Material Library</a>
                <a class="nav-item" href="http://localhost:3000" target="_blank">🔧 Assembly Studio</a>
                <a class="nav-item" href="#" data-view="attendance">Attendance</a>
                <a class="nav-item" href="#" data-view="engineering">Competition</a>
              </nav>
            </aside>
            <section class="content">
              <div class="topbar">
                <div>
                  <h1>🏫 Classroom</h1>
                  <p class="muted">Monitor the live class session, control phases, and track attendance.</p>
                </div>
                <div class="button-row">
                  <span class="badge">${state.user.role}</span>
                  <button class="button secondary" id="sign-out" type="button">Sign out</button>
                </div>
              </div>
              <section class="surface">
                <h2>Select Session</h2>
                <div class="session-selector-row">
                  <select id="classroom-session-select">
                    <option value="">Choose a session...</option>
                    ${sessionOptions}
                  </select>
                </div>
                <div id="classroom-detail"></div>
              </section>
            </section>
          </main>
        `;

        document.querySelector("#sign-out").addEventListener("click", signOut);
        document.querySelectorAll("[data-view]").forEach((item) => {
          item.addEventListener("click", (e) => { e.preventDefault(); handleNavClick(item.dataset.view); });
        });
        const sel = document.querySelector("#classroom-session-select");
        if (sel) {
          if (selectedId) sel.value = selectedId;
          sel.addEventListener("change", handleClassroomSessionSelect);
          if (selectedId) {
            loadClassroomDetail(selectedId);
          }
        }
      }

      async function handleClassroomSessionSelect(event) {
        const sessionId = event.target.value;
        state.selectedAttendanceSessionId = sessionId;
        if (sessionId) {
          await loadClassroomDetail(sessionId);
        } else {
          document.querySelector("#classroom-detail").innerHTML = "";
        }
      }

      let classroomRefreshTimer = null;

      async function loadClassroomDetail(sessionId) {
        const detailEl = document.querySelector("#classroom-detail");
        if (!detailEl) return;
        if (!detailEl.dataset.loading) {
          detailEl.innerHTML = `<div class="classroom-waiting"><span class="pulse"></span> Loading classroom...</div>`;
        }
        detailEl.dataset.loading = "true";
        try {
          const room = await api(`/api/teacher/sessions/${sessionId}/classroom`);
          detailEl.innerHTML = renderClassroomDetailHTML(room);

          document.querySelectorAll(".classroom-phase-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
              const phase = btn.dataset.phase;
              const fd = new FormData(); fd.append("phase", phase);
              await api(`/api/teacher/sessions/${sessionId}/phase`, { method: "PUT", body: fd });
              await loadClassroomDetail(sessionId);
            });
          });
          document.querySelectorAll(".manual-checkin-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
              try {
                await api(`/api/teacher/sessions/${sessionId}/students/${btn.dataset.studentId}/check-in`, { method: "POST" });
                await loadClassroomDetail(sessionId);
              } catch (error) {
                const detailEl = document.querySelector("#classroom-detail");
                if (detailEl) detailEl.insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
              }
            });
          });
          document.querySelectorAll(".teacher-open-material").forEach((button) => {
            button.addEventListener("click", async () => {
              try {
                await openMaterialFile(
                  button.dataset.downloadUrl,
                  button.dataset.materialTitle || "material",
                  button.dataset.isLink === "true",
                  button.dataset.previewUrl || ""
                );
              } catch (error) {
                const detailEl = document.querySelector("#classroom-detail");
                if (detailEl) detailEl.insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
              }
            });
          });
          delete detailEl.dataset.loading;
          startClassroomRefresh(sessionId);
        } catch (error) {
          detailEl.innerHTML = `<div class="banner error">${error.message}</div>`;
          delete detailEl.dataset.loading;
        }
      }

      function startClassroomRefresh(sessionId) {
        if (classroomRefreshTimer) clearInterval(classroomRefreshTimer);
        classroomRefreshTimer = setInterval(() => {
          const detailEl = document.querySelector("#classroom-detail");
          if (!detailEl || state.teacherView !== "classroom") {
            clearInterval(classroomRefreshTimer);
            return;
          }
          loadClassroomDetail(sessionId);
        }, 8000);
      }

      function renderClassroomDetailHTML(room) {
        const phaseNames = { not_started: "Waiting", theory: "Theory", building: "Building" };
        const phaseOrder = ["not_started", "theory", "building"];
        const currentIdx = phaseOrder.indexOf(room.phase);
        const att = room.attendance || {};

        return `
          <div class="classroom-header" style="margin-top:20px;">
            <h1>${room.className}</h1>
            <div class="session-meta">${room.sessionDate} • ${room.startTime}–${room.endTime} ${room.title ? ' • ' + room.title : ''}</div>
          </div>
          ${(function() {
            const labels = ["Waiting", "Theory", "Building"];
            let html = `<div class="phase-indicator">`;
            phaseOrder.forEach((p, idx) => {
              let dotClass = idx < currentIdx ? "done" : idx === currentIdx ? "active" : "";
              let lineClass = idx < currentIdx ? "done" : idx === currentIdx-1 ? "active" : "";
              html += `<div class="phase-step"><span class="phase-dot ${dotClass}">${idx < currentIdx ? '✓' : idx+1}</span>`;
              if (idx < 2) html += `<span class="phase-line ${lineClass}"></span>`;
              html += `</div>`;
            });
            html += `</div><div style="display:flex;justify-content:space-between;margin-top:4px;padding:0 4px;">`;
            labels.forEach((l, i) => html += `<span class="phase-label${i===currentIdx?' active':''}">${l}</span>`);
            html += `</div>`;
            return html;
          })()}
          <div class="button-row" style="margin-top:12px;">
            ${room.status === "scheduled" ? `
              <button class="button classroom-phase-btn" type="button" data-phase="theory" ${room.phase === "theory" ? "disabled" : ""}>Start Theory</button>
              <button class="button classroom-phase-btn" type="button" data-phase="building" ${room.phase === "building" ? "disabled" : ""}>Start Building</button>
            ` : `<span class="badge">Session ${room.status}</span>`}
            <span class="badge">📌 ${phaseNames[room.phase] || room.phase}</span>
          </div>

          ${room.status === "completed" && room.summary ? `
            <section class="surface" style="margin-top:20px;background:#eaf6ef;border-color:#b8d9c8;">
              <h3>📊 Session Summary</h3>
              <div class="metrics-grid" style="margin-top:8px;">
                <article class="metric-card" style="min-height:80px;"><strong>Students</strong><span class="metric-value">${room.summary.totalStudents}</span></article>
                <article class="metric-card" style="min-height:80px;"><strong>Checked In</strong><span class="metric-value" style="color:var(--ok);">${room.summary.checkedIn}</span></article>
                <article class="metric-card" style="min-height:80px;"><strong>Absent</strong><span class="metric-value" style="color:var(--accent);">${room.summary.absent}</span></article>
                <article class="metric-card" style="min-height:80px;"><strong>Materials</strong><span class="metric-value">${room.summary.totalMaterials}</span></article>
                ${room.summary.locationFailed ? `<article class="metric-card" style="min-height:80px;"><strong>Location Issues</strong><span class="metric-value" style="color:#c4820e;">${room.summary.locationFailed}</span></article>` : ""}
              </div>
            </section>
          ` : ""}

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px;">
            <section class="surface">
              <h3>📊 Attendance (${att.attendance ? att.attendance.length : 0}/${room.students.length})</h3>
              ${room.students && room.students.length ? room.students.map((s) => `
                <div class="attendance-row">
                  <span style="min-width:120px;">${s.studentName}</span>
                  ${s.status === "checked_in" ? `<span class="pill location-valid">✅ Checked in</span>`
                    : s.status === "location_failed" ? `<span class="pill location-denied">⚠️ Location failed</span>`
                    : `<span class="pill" style="color:var(--muted);">✗ Not checked in</span>`}
                  ${s.status !== "checked_in" ? `<button class="button secondary manual-checkin-btn" type="button" data-student-id="${s.studentId}" data-student-name="${s.studentName}" style="font-size:11px;min-height:28px;margin-left:auto;">Check In</button>` : ""}
                </div>
              `).join("") : `<div class="empty-state">No students in this class.</div>`}
            </section>
            <section class="surface">
              <h3>📚 Materials (${room.materials.length})</h3>
              ${(() => {
                const theoryList = room.materials.filter(m => m.phaseTag !== "building");
                const buildingList = room.materials.filter(m => m.phaseTag !== "theory");
                const renderItem = (m) => `
                  <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);">
                    <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.title}</span>
                    <span class="pill">${m.fileType}</span>
                    <span class="pill" style="font-size:11px;">${m.phaseTag === "both" ? "Both" : m.phaseTag}</span>
                    <button class="button secondary teacher-open-material" type="button" data-download-url="${m.downloadUrl}" data-material-title="${m.title}" data-is-link="${m.isLink ? "true" : "false"}" data-preview-url="${m.previewUrl || ""}" style="font-size:12px;min-height:30px;">Open</button>
                  </div>`;
                let html = '';
                if (theoryList.length) html += `<p class="muted" style="margin-top:8px;">📖 Theory</p>` + theoryList.map(renderItem).join("");
                if (buildingList.length) html += `<p class="muted" style="margin-top:8px;">🔧 Building</p>` + buildingList.map(renderItem).join("");
                return html || `<div class="empty-state">No materials assigned.</div>`;
              })()}
            </section>
          </div>
        `;
      }

      function renderMaterialsView(data, sessionOptions) {
        const selectedId = state.selectedMaterialId;
        const selectedMaterial = selectedId ? findMaterialById(data.materials, selectedId) : null;
        const steps = state.materialSteps || [];

        app.innerHTML = `
          <main class="portal-shell">
            <aside class="sidebar">
              <div class="sidebar-title">Teacher Dashboard</div>
              <nav class="nav-list">
                <a class="nav-item" href="#" data-view="overview">Overview</a>
                <a class="nav-item" href="#" data-view="students">Students</a>
                <a class="nav-item" href="#" data-view="classes">Classes</a>
                <a class="nav-item" href="#" data-view="sessions">Sessions</a>
                <a class="nav-item" href="#" data-view="classroom">Classroom</a>
                <a class="nav-item active" href="#" data-view="materials">Material Library</a>
                <a class="nav-item" href="#" data-view="attendance">Attendance</a>
                <a class="nav-item" href="#" data-view="engineering">Competition</a>
              </nav>
            </aside>
            <section class="content">
              <div class="topbar">
                <div>
                  <h1>Material Library</h1>
                  <p class="muted">Create courseware with step-by-step lessons. Each step can be a lecture, building activity, discussion, or assignment.</p>
                </div>
                <div class="button-row">
                  <span class="badge">${state.user.role}</span>
                  ${selectedId ? `<button class="button secondary" id="back-to-list" type="button">← Back to list</button>` : `<button class="button secondary" data-view="overview">← Back to Overview</button>`}
                  <button class="button secondary" id="sign-out" type="button">Sign out</button>
                </div>
              </div>
              ${bannerMarkup()}
              ${!selectedId ? `
              <section class="surface">
                <h2>Create New Courseware</h2>
                <form id="material-form">
                  <label for="material-title">Title</label>
                  <input id="material-title" name="title" required placeholder="e.g. Robot Base Assembly" />
                  <label for="material-description">Description</label>
                  <textarea id="material-description" name="description" placeholder="Brief description of this courseware"></textarea>
                  <div class="button-row">
                    <button class="button" type="submit">Create courseware</button>
                  </div>
                </form>
              </section>
              <section class="surface" style="margin-top: 20px;">
                <h2>All Courseware (${data.summary.materialCount})</h2>
                <div class="material-cards">
                  ${data.materials.length ? data.materials.map((material) => renderMaterialCardHTML(material)).join("") : `<div class="empty-state">No courseware yet. Create your first one above.</div>`}
                </div>
              </section>
              ` : renderMaterialStepEditor(selectedMaterial, steps)}
            </section>
          </main>
        `;

        document.querySelector("#sign-out").addEventListener("click", signOut);
        document.querySelectorAll("[data-view]").forEach((item) => {
          item.addEventListener("click", (e) => {
            e.preventDefault();
            handleNavClick(item.dataset.view);
          });
        });

        if (!selectedId) {
          document.querySelector("#material-form").addEventListener("submit", handleMaterialCreate);
          document.querySelectorAll(".material-edit-btn").forEach((btn) => {
            btn.addEventListener("click", () => handleMaterialSelect(btn.dataset.materialId));
          });
          document.querySelectorAll(".material-delete-btn").forEach((btn) => {
            btn.addEventListener("click", () => handleMaterialDelete(btn.dataset.materialId, btn.dataset.materialTitle));
          });
        } else {
          document.querySelector("#back-to-list").addEventListener("click", () => {
            state.selectedMaterialId = null;
            state.materialSteps = null;
            loadTeacherDashboard().then((d) => renderTeacherPortal(d));
          });
          document.querySelector("#step-form").addEventListener("submit", (e) => handleMaterialStepCreate(e, selectedId));
          document.querySelectorAll(".step-edit-btn").forEach((btn) => {
            btn.addEventListener("click", () => toggleStepEdit(btn.dataset.stepId));
          });
          document.querySelectorAll(".step-delete-btn").forEach((btn) => {
            btn.addEventListener("click", () => handleMaterialStepDelete(btn.dataset.stepId, selectedId));
          });
          document.querySelectorAll(".step-edit-form").forEach((form) => {
            form.addEventListener("submit", (e) => handleMaterialStepEdit(e, form.dataset.stepId, selectedId));
          });
          document.querySelectorAll(".step-move-up").forEach((btn) => {
            btn.addEventListener("click", () => handleStepMove(btn.dataset.stepId, "up", selectedId, steps));
          });
          document.querySelectorAll(".step-move-down").forEach((btn) => {
            btn.addEventListener("click", () => handleStepMove(btn.dataset.stepId, "down", selectedId, steps));
          });
          document.querySelectorAll(".step-upload-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
              const fileInput = document.querySelector(`#step-file-${btn.dataset.stepId}`);
              if (fileInput) fileInput.click();
            });
          });
          document.querySelectorAll(".step-file-input").forEach((input) => {
            input.addEventListener("change", () => handleStepFileUpload(input.dataset.stepId, selectedId, input));
          });
        }
      }

      function findMaterialById(materials, id) {
        return materials.find(m => m.id === id) || null;
      }

      function renderMaterialCardHTML(material) {
        return `
          <article class="material-card">
            <header>
              <div>
                <strong>${material.title}</strong>
                <div class="material-meta">${material.stepCount || 0} step(s)</div>
              </div>
              <span class="pill">${material.stepCount || 0} steps</span>
            </header>
            <p class="muted">${material.description || "No description."}</p>
            <div class="material-actions">
              <button class="button material-edit-btn" type="button" data-material-id="${material.id}">Edit Steps</button>
              <button class="button danger material-delete-btn" type="button" data-material-id="${material.id}" data-material-title="${material.title}">Delete</button>
            </div>
          </article>
        `;
      }

      function renderMaterialStepEditor(material, steps) {
        const TYPE_LABELS = {
          lecture: "📖 Lecture",
          building: "🔧 Building",
          discussion: "💬 Discussion",
          homework: "📝 Homework",
          writing: "✍️ Writing",
          file_upload: "📎 File Upload",
        };
        return `
          <section class="surface">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
              <div>
                <h2 style="margin:0;">${material.title}</h2>
                <p class="muted" style="margin:4px 0 0 0;">${material.description || "No description."} — ${steps.length} step(s)</p>
              </div>
            </div>
          </section>
          <section class="surface" style="margin-top: 20px;">
            <h3>Add Step</h3>
            <form id="step-form">
              <div style="display:flex;gap:12px;flex-wrap:wrap;">
                <div style="flex:1;min-width:140px;">
                  <label for="step-type">Type</label>
                  <select id="step-type" name="step_type">
                    <option value="lecture">📖 Lecture</option>
                    <option value="building">🔧 Building</option>
                    <option value="discussion">💬 Discussion</option>
                    <option value="homework">📝 Homework</option>
                    <option value="writing">✍️ Writing</option>
                    <option value="file_upload">📎 File Upload</option>
                  </select>
                </div>
                <div style="flex:2;min-width:200px;">
                  <label for="step-title">Step Title</label>
                  <input id="step-title" name="title" required placeholder="e.g. Assemble the chassis" />
                </div>
              </div>
              <label for="step-content" style="margin-top:12px;">Content / Instructions</label>
              <textarea id="step-content" name="content" placeholder="Describe what the student should do in this step..."></textarea>
              <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px;">
                <div style="flex:1;min-width:200px;">
                  <label for="step-attachment-url">Attachment URL (optional)</label>
                  <input id="step-attachment-url" name="attachment_url" placeholder="https://..." />
                </div>
                <div style="flex:1;min-width:200px;">
                  <label for="step-attachment-name">Attachment Name (optional)</label>
                  <input id="step-attachment-name" name="attachment_name" placeholder="e.g. guide.pdf" />
                </div>
              </div>
              <div class="button-row" style="margin-top:12px;">
                <button class="button" type="submit">Add Step</button>
              </div>
            </form>
          </section>
          <section class="surface" style="margin-top: 20px;">
            <h3>Steps</h3>
            ${steps.length ? steps.map((step, idx) => {
              const isEditing = state.editingStepId === step.id;
              return `
                <article class="material-card" style="margin-bottom:12px;">
                  <header>
                    <div>
                      <strong>#${step.stepNumber} ${step.title}</strong>
                      <div class="material-meta">${TYPE_LABELS[step.stepType] || step.stepType}</div>
                    </div>
                    <span class="pill">${TYPE_LABELS[step.stepType] || step.stepType}</span>
                  </header>
                  <p class="muted">${step.content || "No content."}</p>
                  ${step.attachmentUrl ? `<p class="muted">📎 <a href="${step.attachmentUrl}" target="_blank">${step.attachmentName || step.attachmentUrl}</a></p>` : ""}
                  <div class="material-actions">
                    <button class="button secondary step-move-up" type="button" data-step-id="${step.id}" ${idx === 0 ? "disabled" : ""}>▲</button>
                    <button class="button secondary step-move-down" type="button" data-step-id="${step.id}" ${idx === steps.length - 1 ? "disabled" : ""}>▼</button>
                    <button class="button secondary step-upload-btn" type="button" data-step-id="${step.id}">📎 Upload</button>
                    <input type="file" id="step-file-${step.id}" class="step-file-input" data-step-id="${step.id}" style="display:none;" />
                    <button class="button secondary step-edit-btn" type="button" data-step-id="${step.id}">${isEditing ? "Cancel" : "Edit"}</button>
                    <button class="button danger step-delete-btn" type="button" data-step-id="${step.id}">Delete</button>
                  </div>
                  ${isEditing ? `
                    <form class="inline-edit-form step-edit-form" data-step-id="${step.id}" style="margin-top:12px;">
                      <div style="display:flex;gap:12px;flex-wrap:wrap;">
                        <div style="flex:1;min-width:140px;">
                          <label>Type</label>
                          <select name="step_type">
                            ${Object.entries(TYPE_LABELS).map(([val, label]) => `<option value="${val}" ${step.stepType === val ? "selected" : ""}>${label}</option>`).join("")}
                          </select>
                        </div>
                        <div style="flex:2;min-width:200px;">
                          <label>Title</label>
                          <input name="title" value="${step.title.replace(/"/g, "&quot;")}" required />
                        </div>
                      </div>
                      <label style="margin-top:8px;">Content</label>
                      <textarea name="content">${(step.content || "").replace(/"/g, "&quot;")}</textarea>
                      <label style="margin-top:8px;">Attachment URL</label>
                      <input name="attachment_url" value="${(step.attachmentUrl || "").replace(/"/g, "&quot;")}" />
                      <label style="margin-top:8px;">Attachment Name</label>
                      <input name="attachment_name" value="${(step.attachmentName || "").replace(/"/g, "&quot;")}" />
                      <div class="button-row" style="margin-top:12px;">
                        <button class="button" type="submit">Save Step</button>
                      </div>
                    </form>
                  ` : ""}
                </article>
              `;
            }).join("") : `<div class="empty-state">No steps yet. Add the first step above.</div>`}
          </section>
        `;
      }

      function renderAttendanceView(data, sessionOptions) {
        const detail = state.attendanceData;
        app.innerHTML = `
          <main class="portal-shell">
            <aside class="sidebar">
              <div class="sidebar-title">Teacher Dashboard</div>
              <nav class="nav-list">
                <a class="nav-item" href="#" data-view="overview">Overview</a>
                <a class="nav-item" href="#" data-view="students">Students</a>
                <a class="nav-item" href="#" data-view="classes">Classes</a>
                <a class="nav-item" href="#" data-view="sessions">Sessions</a>
                <a class="nav-item" href="#" data-view="classroom">Classroom</a>
                <a class="nav-item" href="#" data-view="materials">Material Library</a>
                <a class="nav-item active" href="#" data-view="attendance">Attendance</a>
                <a class="nav-item" href="#" data-view="engineering">Competition</a>
              </nav>
            </aside>
            <section class="content">
              <div class="topbar">
                <div>
                  <h1>Attendance</h1>
                  <p class="muted">View verified attendance, location failures, and absent students per session.</p>
                </div>
                <div class="button-row">
                  <span class="badge">${state.user.role}</span>
                  <button class="button secondary" data-view="overview">← Back to Overview</button>
                  <button class="button secondary" id="sign-out" type="button">Sign out</button>
                </div>
              </div>
              <section class="surface">
                <h2>Select Session</h2>
                <div class="session-selector-row">
                  <select id="attendance-session-select">
                    <option value="">Choose a session...</option>
                    ${sessionOptions}
                  </select>
                </div>
                ${detail ? renderAttendanceDetailHTML(detail) : `<p class="muted" style="margin-top:16px;">Select a session above to view its attendance records.</p>`}
              </section>
            </section>
          </main>
        `;

        document.querySelector("#sign-out").addEventListener("click", signOut);
        document.querySelectorAll("[data-view]").forEach((item) => {
          item.addEventListener("click", (e) => {
            e.preventDefault();
            handleNavClick(item.dataset.view);
          });
        });
        const sessionSelect = document.querySelector("#attendance-session-select");
        if (sessionSelect) {
          sessionSelect.addEventListener("change", handleAttendanceSessionSelect);
          if (state.selectedAttendanceSessionId) {
            sessionSelect.value = state.selectedAttendanceSessionId;
          }
        }
      }

      function renderAttendanceDetailHTML(detail) {
        return `
          <div class="attendance-section" style="margin-top:20px;">
            <h3 style="border-bottom:none;">${detail.className} — ${detail.sessionDate} ${detail.startTime}–${detail.endTime}</h3>
          </div>
          <div class="attendance-section">
            <h3>Verified Attendance (${detail.attendance.length})</h3>
            ${detail.attendance.length ? detail.attendance.map((a) => `
              <div class="attendance-row">
                <span style="min-width:160px;">${a.studentName}</span>
                <span class="pill location-valid">Verified</span>
                <span class="muted">${new Date(a.checkedInAt).toLocaleTimeString()}</span>
              </div>
            `).join("") : `<div class="empty-state">No students have checked in yet.</div>`}
          </div>
          ${detail.locationAttempts && detail.locationAttempts.length ? `
          <div class="attendance-section">
            <h3>Location Verification Failed (${detail.locationAttempts.length})</h3>
            ${detail.locationAttempts.map((a) => `
              <div class="attendance-row">
                <span style="min-width:160px;">${a.studentName}</span>
                <span class="pill location-${a.locationStatus}">${a.locationStatus}</span>
                <span class="muted">${a.materialTitle}</span>
                <span class="muted">${new Date(a.attemptedAt).toLocaleTimeString()}</span>
              </div>
            `).join("")}
          </div>
          ` : ""}
          <div class="attendance-section">
            <h3>Absent / No Activity (${detail.absentStudents.length})</h3>
            ${detail.absentStudents.length ? detail.absentStudents.map((a) => `
              <div class="attendance-row">
                <span style="min-width:160px;">${a.studentName}</span>
                <span class="muted">No activity recorded</span>
              </div>
            `).join("") : `<div class="empty-state">All active class members are accounted for.</div>`}
          </div>
        `;
      }

      function handleNavClick(view) {
        state.teacherView = view;
        state.editingMaterialId = null;
        state.attendanceData = null;
        state.selectedAttendanceSessionId = null;
        state.flash = "";
        loadTeacherDashboard().then((data) => renderTeacherPortal(data));
      }

      async function handleMaterialSelect(materialId) {
        state.selectedMaterialId = materialId;
        try {
          const detail = await api(`/api/teacher/materials/${materialId}`);
          state.materialSteps = detail.steps || [];
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
        } catch (error) {
          state.flash = "";
          state.selectedMaterialId = null;
          state.materialSteps = null;
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          const surface = app.querySelector(".surface");
          if (surface) surface.insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      function toggleStepEdit(stepId) {
        if (state.editingStepId === stepId) {
          state.editingStepId = null;
        } else {
          state.editingStepId = stepId;
        }
        loadTeacherDashboard().then((data) => renderTeacherPortal(data));
      }

      async function handleMaterialDelete(materialId, materialTitle) {
        if (!confirm(`Delete "${materialTitle}" and all its steps?`)) return;
        try {
          await api(`/api/teacher/materials/${materialId}`, { method: "DELETE" });
          state.flash = "Courseware deleted.";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
        } catch (error) {
          state.flash = "";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          const surface = app.querySelector(".surface");
          if (surface) surface.insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      async function handleMaterialStepCreate(event, materialId) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await api(`/api/teacher/materials/${materialId}/steps`, {
            method: "POST",
            body: JSON.stringify({
              step_type: form.get("step_type"),
              title: form.get("title"),
              content: form.get("content") || "",
              attachment_url: form.get("attachment_url") || "",
              attachment_name: form.get("attachment_name") || "",
            }),
          });
          const detail = await api(`/api/teacher/materials/${materialId}`);
          state.materialSteps = detail.steps || [];
          state.flash = "Step added.";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
        } catch (error) {
          state.flash = "";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          const surface = app.querySelector(".surface");
          if (surface) surface.insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      async function handleMaterialStepEdit(event, stepId, materialId) {
        event.preventDefault();
        const form = new FormData(event.target);
        try {
          await api(`/api/teacher/materials/${materialId}/steps/${stepId}`, {
            method: "PUT",
            body: JSON.stringify({
              step_type: form.get("step_type"),
              title: form.get("title"),
              content: form.get("content") || "",
              attachment_url: form.get("attachment_url") || "",
              attachment_name: form.get("attachment_name") || "",
            }),
          });
          state.editingStepId = null;
          const detail = await api(`/api/teacher/materials/${materialId}`);
          state.materialSteps = detail.steps || [];
          state.flash = "Step updated.";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
        } catch (error) {
          state.flash = "";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          const surface = app.querySelector(".surface");
          if (surface) surface.insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      async function handleMaterialStepDelete(stepId, materialId) {
        if (!confirm("Delete this step?")) return;
        try {
          await api(`/api/teacher/materials/${materialId}/steps/${stepId}`, { method: "DELETE" });
          const detail = await api(`/api/teacher/materials/${materialId}`);
          state.materialSteps = detail.steps || [];
          state.flash = "Step deleted.";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
        } catch (error) {
          state.flash = "";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          const surface = app.querySelector(".surface");
          if (surface) surface.insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      async function handleStepMove(stepId, direction, materialId, steps) {
        const idx = steps.findIndex(s => s.id === stepId);
        if (idx < 0) return;
        const newIdx = direction === "up" ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= steps.length) return;
        const reordered = [...steps];
        [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
        try {
          await api(`/api/teacher/materials/${materialId}/steps/reorder`, {
            method: "PUT",
            body: JSON.stringify({ step_ids: reordered.map(s => s.id) }),
          });
          const detail = await api(`/api/teacher/materials/${materialId}`);
          state.materialSteps = detail.steps || [];
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
        } catch (error) {
          state.flash = "";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          const surface = app.querySelector(".surface");
          if (surface) surface.insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      async function handleStepFileUpload(stepId, materialId, fileInput) {
        const file = fileInput.files[0];
        if (!file) return;
        try {
          const form = new FormData();
          form.append("file", file);
          await api(`/api/teacher/materials/${materialId}/steps/${stepId}/upload`, {
            method: "POST",
            body: form,
          });
          const detail = await api(`/api/teacher/materials/${materialId}`);
          state.materialSteps = detail.steps || [];
          state.flash = `File "${file.name}" uploaded.`;
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
        } catch (error) {
          state.flash = "";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          const surface = app.querySelector(".surface");
          if (surface) surface.insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      async function handleAttendanceSessionSelect(event) {
        const sessionId = event.target.value;
        if (!sessionId) {
          state.selectedAttendanceSessionId = null;
          state.attendanceData = null;
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          return;
        }
        try {
          state.selectedAttendanceSessionId = sessionId;
          state.attendanceData = await api(`/api/teacher/sessions/${sessionId}/attendance`);
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
        } catch (error) {
          state.flash = "";
          state.selectedAttendanceSessionId = null;
          state.attendanceData = null;
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          const surface = app.querySelector(".surface");
          if (surface) surface.insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      async function loadTeacherDashboard() {
        return api("/api/teacher/dashboard");
      }

      async function rerenderTeacherWithMessage(message) {
        state.flash = message;
        const data = await loadTeacherDashboard();
        renderTeacherPortal(data);
      }

      async function handleResetStudentPassword(studentId, studentName) {
        if (!confirm(`Reset password for ${studentName}? A new temporary password will be generated.`)) return;
        try {
          const result = await api(`/api/teacher/students/${studentId}/reset-password`, { method: "POST" });
          await rerenderTeacherWithMessage(`New password for ${result.studentName}: <code style="background:#fff;padding:2px 6px;border-radius:3px;font-weight:800;">${result.newPassword}</code>`);
        } catch (error) {
          state.flash = "";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          const surface = app.querySelector(".surface");
          if (surface) surface.insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      async function handleStudentCreate(event) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          const result = await api("/api/teacher/students", {
            method: "POST",
            body: JSON.stringify({
              display_name: form.get("display_name"),
              email: form.get("email"),
              parent_name: form.get("parent_name") || "",
              password: form.get("password") || "",
            })
          });
          const pwd = result.generatedPassword || "";
          const msg = pwd
            ? `Student created. Password: <code style="background:#fff;padding:2px 6px;border-radius:3px;font-weight:800;">${pwd}</code>`
            : "Student created.";
          await rerenderTeacherWithMessage(msg);
        } catch (error) {
          state.flash = "";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          app.querySelector(".section-copy").insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      async function handleClassCreate(event) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await api("/api/teacher/classes", {
            method: "POST",
            body: JSON.stringify({
              name: form.get("name"),
              description: form.get("description") || "",
              weekday: Number(form.get("weekday")),
              start_time: form.get("start_time"),
              end_time: form.get("end_time")
            })
          });
          await rerenderTeacherWithMessage("Class created.");
        } catch (error) {
          state.flash = "";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          app.querySelector(".section-copy").insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      async function handleMembershipCreate(event) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await api(`/api/teacher/classes/${form.get("class_id")}/memberships`, {
            method: "POST",
            body: JSON.stringify({ student_id: form.get("student_id") })
          });
          await rerenderTeacherWithMessage("Student added to class.");
        } catch (error) {
          state.flash = "";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          app.querySelector(".section-copy").insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      function toggleStudentEdit(studentId) {
        state.editingStudentId = state.editingStudentId === studentId ? null : studentId;
        state.editingClassId = null;
        loadTeacherDashboard().then((data) => renderTeacherPortal(data));
      }

      async function handleStudentEdit(event, studentId) {
        event.preventDefault();
        const form = new FormData(event.target);
        try {
          await api(`/api/teacher/students/${studentId}`, {
            method: "PUT",
            body: JSON.stringify({
              display_name: form.get("display_name"),
              email: form.get("email"),
              parent_name: form.get("parent_name") || "",
              password: form.get("password") || "",
            }),
          });
          state.editingStudentId = null;
          state.flash = "Student updated.";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
        } catch (error) {
          state.flash = "";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          const surface = app.querySelector(".surface");
          if (surface) surface.insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      function toggleClassEdit(classId) {
        state.editingClassId = state.editingClassId === classId ? null : classId;
        state.editingStudentId = null;
        loadTeacherDashboard().then((data) => renderTeacherPortal(data));
      }

      async function handleClassEdit(event, classId) {
        event.preventDefault();
        const form = new FormData(event.target);
        try {
          await api(`/api/teacher/classes/${classId}`, {
            method: "PUT",
            body: JSON.stringify({
              name: form.get("name"),
              description: form.get("description") || "",
              weekday: Number(form.get("weekday")),
              start_time: form.get("start_time"),
              end_time: form.get("end_time"),
            }),
          });
          state.editingClassId = null;
          state.flash = "Class updated.";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
        } catch (error) {
          state.flash = "";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          const surface = app.querySelector(".surface");
          if (surface) surface.insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      async function handleGenerateSessions(event) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          const result = await api(`/api/teacher/classes/${form.get("class_id")}/generate-sessions`, {
            method: "POST",
            body: JSON.stringify({
              term_start_date: form.get("term_start_date"),
              session_count: Number(form.get("session_count"))
            })
          });
          state.teacherView = "sessions";
          if (!result.generatedCount) {
            await rerenderTeacherWithMessage("No new sessions were created. Matching session dates already exist for this class.");
            return;
          }
          const sessionLabel = result.generatedCount === 1 ? "session" : "sessions";
          await rerenderTeacherWithMessage(`${result.generatedCount} ${sessionLabel} created.`);
        } catch (error) {
          state.flash = "";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          app.querySelector(".section-copy").insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      async function handleDeleteSession(sessionId) {
        try {
          await api(`/api/teacher/sessions/${sessionId}`, { method: "DELETE" });
          await rerenderTeacherWithMessage("Session cancelled.");
        } catch (error) {
          state.flash = "";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          app.querySelector(".section-copy").insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      async function handleUpdateSessionStatus(sessionId, status) {
        try {
          await api(`/api/teacher/sessions/${sessionId}`, {
            method: "PUT",
            body: JSON.stringify({ status }),
          });
          const label = status === "completed" ? "completed" : "cancelled";
          await rerenderTeacherWithMessage(`Session ${label}.`);
        } catch (error) {
          state.flash = "";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          app.querySelector(".section-copy").insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      async function handleUpdateSessionPhase(sessionId, phase) {
        const formData = new FormData();
        formData.append("phase", phase);
        try {
          await api(`/api/teacher/sessions/${sessionId}/phase`, {
            method: "PUT",
            body: formData,
          });
          const label = phase === "theory" ? "Theory phase started" : "Building phase started";
          await rerenderTeacherWithMessage(label);
        } catch (error) {
          state.flash = "";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          app.querySelector(".section-copy").insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      async function handleMaterialCreate(event) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await api("/api/teacher/materials", {
            method: "POST",
            body: form
          });
          await rerenderTeacherWithMessage("Courseware created.");
        } catch (error) {
          state.flash = "";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          const surface = app.querySelector(".surface");
          if (surface) surface.insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      async function handleMaterialAssignment(event) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const assignedToType = form.get("assigned_to_type");
        try {
          await api(`/api/teacher/sessions/${form.get("session_id")}/assign-material`, {
            method: "POST",
            body: JSON.stringify({
              material_id: form.get("material_id"),
              assigned_to_type: assignedToType,
              assigned_to_student_id: assignedToType === "student" ? form.get("assigned_to_student_id") : null,
              phase_tag: form.get("phase_tag") || "both",
            })
          });
          await rerenderTeacherWithMessage("Material assigned.");
        } catch (error) {
          state.flash = "";
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          app.querySelector(".section-copy").insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
        }
      }

      async function getBrowserLocationPermissionState() {
        if (!navigator.permissions?.query) {
          return null;
        }
        try {
          const result = await navigator.permissions.query({ name: "geolocation" });
          return result.state;
        } catch {
          return null;
        }
      }

      async function getBrowserLocationForAttendance() {
        if (!("geolocation" in navigator)) {
          return { location_permission: "unavailable", latitude: null, longitude: null };
        }
        const permissionState = await getBrowserLocationPermissionState();
        if (permissionState === "denied") {
          return { location_permission: "denied", latitude: null, longitude: null };
        }
        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) => resolve({
              location_permission: "granted",
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            }),
            (error) => resolve({
              location_permission: error.code === 1 ? "denied" : "unavailable",
              latitude: null,
              longitude: null
            }),
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
          );
        });
      }

      async function handleOpenMaterial(dataset) {
        const source = dataset.source;
        let location = { location_permission: "not_required", latitude: null, longitude: null };
        let locationPromise = null;
        if (source === "current_lesson") {
          locationPromise = getBrowserLocationForAttendance();
          state.studentNotice = "📍 Getting your location for attendance check-in...";
          const currentData = await api("/api/student/current-lesson");
          renderStudentPortal(currentData);
          location = await locationPromise;
        }

        try {
          const result = await api(`/api/materials/${dataset.materialId}/open`, {
            method: "POST",
            body: JSON.stringify({
              source,
              class_session_id: dataset.sessionId || null,
              latitude: location.latitude,
              longitude: location.longitude,
              location_permission: location.location_permission
            })
          });

          if (source === "current_lesson") {
            if (result.attendance && result.locationStatus === "valid") {
              state.studentNotice = "✅ Attendance verified for this session — material opened in new tab.";
            } else if (result.locationStatus === "outside") {
              state.studentNotice = "⚠️ You are outside the classroom area — material opened but attendance not recorded.";
            } else if (result.locationStatus === "denied") {
              state.studentNotice = "⚠️ Location permission was denied or blocked by the browser — material opened but attendance not recorded.";
            } else if (result.locationStatus === "unavailable") {
              state.studentNotice = "⚠️ Location unavailable on this device/browser — material opened but attendance could not be verified.";
            } else {
              state.studentNotice = `📖 Material opened. (Attendance: ${result.locationStatus})`;
            }
          } else {
            state.studentNotice = "📖 Review material opened in new tab.";
          }

          if (dataset.downloadUrl) {
            await openMaterialFile(
              dataset.downloadUrl,
              dataset.materialTitle || "material",
              dataset.isLink === "true",
              dataset.previewUrl || ""
            );
          }

          // Refresh the current student view
          const refreshData = await api("/api/student/current-lesson");
          renderStudentPortal(refreshData);
        } catch (error) {
          state.studentNotice = "";
          const refreshData = await api("/api/student/current-lesson");
          renderStudentPortal(refreshData);
          const secCopy = app.querySelector(".section-copy");
          if (secCopy) {
            secCopy.insertAdjacentHTML("beforeend", `<div class="banner error">${error.message}</div>`);
          }
        }
      }

      async function hydrateUser() {
        if (!state.token || state.user) return state.user;
        try {
          const payload = await api("/api/me");
          state.user = payload.user;
          return state.user;
        } catch {
          localStorage.removeItem("robogo-token");
          state.token = null;
          return null;
        }
      }

      async function render() {
        const user = await hydrateUser();
        const path = window.location.pathname;

        if (!user) {
          renderLogin();
          return;
        }

        if (path.startsWith("/teacher")) {
          if (user.role !== "Teacher") {
            routeTo("/student");
            return;
          }
          const data = await loadTeacherDashboard();
          renderTeacherPortal(data);
          return;
        }

        if (path.startsWith("/student")) {
          if (user.role !== "Student") {
            routeTo("/teacher");
            return;
          }
          const data = await api("/api/student/current-lesson");
          renderStudentPortal(data);
          return;
        }

        routeTo(user.role === "Teacher" ? "/teacher" : "/student");
      }

      window.addEventListener("popstate", render);
      render();
