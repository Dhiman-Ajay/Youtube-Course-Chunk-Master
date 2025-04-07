// content.js

// --- Constants ---
const VIDEO_LIST_KEY = 'videoList';
const SETTINGS_KEY = 'settings';

// --- Global Variables ---
let player;
let currentVideoId = null;
let currentVideoTitle = '';
let videoDuration = 0;
let chunkSizeMinutes = 5; // Default, will be overridden by settings/video data
let chunkSizeSeconds = chunkSizeMinutes * 60;
let totalChunks = 0;
let completedChunks = 0;

let taskListOverlay;
let isTaskListVisible = true;
let taskListToggleBtn;

let lastConfirmedChunkIndex = -1; // Track the *index* (0-based)
let completionCheckDebounceTimer = null; // Timer for debouncing end-of-video check
let isShowingModal = false; // Flag to prevent stacking modals

// --- Initialization ---
function getVideoId() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('v');
    } catch (e) {
        console.error("Error extracting video ID:", e);
        return null;
    }
}

async function initializeExtension() {
    console.log("YT Course Chunk Master: Initializing...");
    currentVideoId = getVideoId();
    if (!currentVideoId) {
        console.log("No video ID found on this page. Extension inactive.");
        return;
    }
    console.log("Current Video ID:", currentVideoId);

    try {
        player = await waitForPlayer();
        console.log("Player found:", player);

        // Load settings and video data before proceeding
        const { settings, videoData } = await loadInitialData();

        // Determine chunk size (video-specific > default setting)
        chunkSizeMinutes = videoData?.chunkSizeMinutes || settings?.defaultChunkSizeMinutes || 5;
        chunkSizeSeconds = chunkSizeMinutes * 60;
        console.log(`Using chunk size: ${chunkSizeMinutes} minutes (${chunkSizeSeconds} seconds)`);

        // Create UI Elements
        createOrUpdateTaskListOverlay(); // Use createOrUpdate function
        addOrUpdateToggleButtonToPlayer(); // Use createOrUpdate function

        // Setup event listeners
        player.addEventListener('loadedmetadata', handleVideoMetadataLoaded);
        player.addEventListener('timeupdate', handleTimeUpdate);
        player.addEventListener('seeked', handleSeek); // Handle seeking explicitly

        // Handle case where video metadata is already loaded
        if (player.readyState > 0 && player.duration) {
            console.log("Video metadata already loaded, processing now.");
            handleVideoMetadataLoaded(); // Manually trigger if already loaded
        } else {
            console.log("Waiting for video metadata...");
        }

    } catch (error) {
        console.error('YT Course Chunk Master: Error initializing extension:', error);
    }
}

async function waitForPlayer() {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 20; // Try for 10 seconds
        const interval = setInterval(() => {
            const video = document.querySelector('video.html5-main-video');
            if (video) {
                clearInterval(interval);
                resolve(video);
            } else {
                attempts++;
                if (attempts >= maxAttempts) {
                    clearInterval(interval);
                    reject(new Error('YouTube video player not found after multiple attempts.'));
                }
            }
        }, 500);
    });
}

// --- Data Loading and Saving ---
async function loadInitialData() {
    const result = await chrome.storage.local.get([SETTINGS_KEY, VIDEO_LIST_KEY]);
    const settings = result[SETTINGS_KEY] || {};
    const videoList = result[VIDEO_LIST_KEY] || [];
    const videoData = videoList.find(v => v.videoId === currentVideoId);

    if (videoData) {
        console.log("Found existing data for this video:", videoData);
        completedChunks = videoData.completedChunks || 0;
        // totalChunks will be calculated based on duration and loaded chunk size
    } else {
        console.log("No existing data for this video, starting fresh.");
        completedChunks = 0;
    }
    lastConfirmedChunkIndex = completedChunks -1; // Initialize based on loaded chunks

    return { settings, videoData };
}

async function saveProgress() {
    if (!currentVideoId) return;

    console.log(`Saving progress: ${completedChunks}/${totalChunks} chunks.`);
    try {
        const result = await chrome.storage.local.get(VIDEO_LIST_KEY);
        let videoList = result[VIDEO_LIST_KEY] || [];
        const index = videoList.findIndex(v => v.videoId === currentVideoId);

        if (index > -1) {
            // Update existing entry
            videoList[index].completedChunks = completedChunks;
            videoList[index].totalChunks = totalChunks; // Ensure total is up-to-date
            videoList[index].chunkSizeMinutes = chunkSizeMinutes; // Ensure chunk size is saved
            videoList[index].lastWatched = Date.now();
        } else {
            // Add new entry (only if user explicitly adds via popup, but good to have safeguard)
            // This function primarily *updates* existing entries based on watching.
            // Adding is handled by the popup.
            console.log("Video not in list, progress not saved to storage yet (add via popup).");
            // Optionally, we *could* auto-add here, but explicit adding is safer.
             return; // Don't save if not explicitly added
        }

        await chrome.storage.local.set({ [VIDEO_LIST_KEY]: videoList });
        console.log("Progress saved to storage.");

        // Notify popup about the progress update
         chrome.runtime.sendMessage({
             action: 'videoProgressUpdate',
             data: {
                 videoId: currentVideoId,
                 completedChunks: completedChunks,
                 totalChunks: totalChunks,
                 percentage: totalChunks > 0 ? Math.round((completedChunks / totalChunks) * 100) : 0
             }
         }).catch(err => console.warn("Could not send progress update to popup:", err.message)); // Catch error if popup isn't open


    } catch (error) {
        console.error("Error saving progress to storage:", error);
    }
}


// --- Event Handlers ---

function handleVideoMetadataLoaded() {
    videoDuration = player.duration;
    currentVideoTitle = document.title.replace(" - YouTube", ""); // Get cleaner title
    console.log(`Metadata loaded: Duration=${videoDuration}s, Title="${currentVideoTitle}"`);

    if (!videoDuration || isNaN(videoDuration)) {
        console.error("Invalid video duration detected.");
        return; // Don't proceed if duration is bad
    }

    resetAndCalculateChunks();
    updateProgressMarkers(); // Create or update markers
    updateTaskList(); // Update task list UI
    saveProgress(); // Save initial state (0 completed or loaded state)
}

function handleTimeUpdate() {
    if (!player || !videoDuration || isNaN(player.currentTime) || isNaN(chunkSizeSeconds) || chunkSizeSeconds <= 0) return; // Sanity checks

    const currentTime = player.currentTime;
    const currentChunkIndex = Math.floor(currentTime / chunkSizeSeconds); // 0-based index

    // --- Fix for Flickering Completion Modal ---
    // Use debouncing: Only check for completion after a short pause in time updates near the end.
    const endThreshold = videoDuration * 0.98; // 98% mark

    clearTimeout(completionCheckDebounceTimer); // Clear previous debounce timer

    if (currentTime >= endThreshold) {
        completionCheckDebounceTimer = setTimeout(() => {
            // Check *again* within the debounced function
            if (player.currentTime >= endThreshold && completedChunks >= totalChunks -1 && !isShowingModal ) { // Ensure we are on the last chunk
                 console.log("Near video end, triggering completion check.");
                 showCompletionConfirmation();
            }
        }, 500); // Wait 500ms after the last timeupdate near the end
    }


    // Determine direction of movement
    if (currentChunkIndex > lastConfirmedChunkIndex) {
        // Moving forward into a new chunk
        console.log(`Entered chunk ${currentChunkIndex + 1} (index ${currentChunkIndex})`);
        completedChunks = Math.min(currentChunkIndex + 1, totalChunks); // Mark *up to* the end of the current chunk as complete
        lastConfirmedChunkIndex = currentChunkIndex;
        updateProgressMarkers();
        updateTaskList();
        saveProgress();
    }
    // Note: Backward movement confirmation is handled by handleSeek now
}

function handleSeek() {
    if (!player || !videoDuration || isNaN(player.currentTime)) return;

    const currentTime = player.currentTime;
    const targetChunkIndex = Math.floor(currentTime / chunkSizeSeconds);

    console.log(`Seek detected to time ${currentTime}, target chunk index ${targetChunkIndex}`);

    // Check if seeking *backwards* into an unconfirmed area
    if (targetChunkIndex < lastConfirmedChunkIndex && !isShowingModal) {
        console.log("Seeked backwards into previously completed area.");
        showRewatchConfirmation(targetChunkIndex);
    } else if (targetChunkIndex > lastConfirmedChunkIndex) {
         // If seeking forward *past* multiple chunks, update progress accordingly
         console.log(`Seeked forward past chunks. Updating progress to chunk ${targetChunkIndex + 1}`);
         completedChunks = Math.min(targetChunkIndex + 1, totalChunks);
         lastConfirmedChunkIndex = targetChunkIndex;
         updateProgressMarkers();
         updateTaskList();
         saveProgress();
    } else {
        // Seeking within the current chunk or to the start of the next immediate one
        // Update the current task highlighting
         lastConfirmedChunkIndex = targetChunkIndex; // Update confirmed index even on small seeks
         updateTaskList();
    }
}


// --- Chunk Management ---
function resetAndCalculateChunks() {
    if (!videoDuration || !chunkSizeSeconds || chunkSizeSeconds <= 0) {
         console.warn("Cannot calculate chunks: Invalid duration or chunk size.");
         totalChunks = 0;
         // completedChunks remains as loaded
    } else {
        totalChunks = Math.ceil(videoDuration / chunkSizeSeconds);
        // Ensure completedChunks doesn't exceed the new total
        completedChunks = Math.min(completedChunks, totalChunks);
    }
    lastConfirmedChunkIndex = completedChunks - 1; // Reset based on current completion
    isShowingModal = false; // Reset modal flag on video change/reset
    clearTimeout(completionCheckDebounceTimer); // Clear any pending completion checks

    console.log(`Chunks reset: Total=${totalChunks}, Completed=${completedChunks}, ChunkSize=${chunkSizeMinutes}min`);

    // Clear existing markers before creating new ones
    document.querySelectorAll('.ytp-chunk-marker').forEach(marker => marker.remove());
}

function updateProgressMarkers() {
    const progressBar = document.querySelector('.ytp-progress-bar');
    if (!progressBar || totalChunks <= 0 || !videoDuration) return;

    // Clear existing markers first to handle chunk size changes
    progressBar.querySelectorAll('.ytp-chunk-marker').forEach(marker => marker.remove());

    for (let i = 0; i < totalChunks - 1; i++) { // Markers go *between* chunks
        const markerTime = (i + 1) * chunkSizeSeconds;
        const positionPercent = (markerTime / videoDuration) * 100;

        if (positionPercent >= 0 && positionPercent <= 100) {
            const marker = document.createElement('div');
            marker.className = 'ytp-chunk-marker';
             // Add 'completed' class based on the chunk *before* the marker
            if (i < completedChunks) {
                 marker.classList.add('completed');
             }
            marker.style.left = `${positionPercent}%`;
            // Style is applied via styles.css injected by manifest
            progressBar.appendChild(marker);
        }
    }
     // console.log("Progress markers updated.");
}

// --- Task List UI ---
function createOrUpdateTaskListOverlay() {
    taskListOverlay = document.getElementById('yt-task-overlay');

    if (!taskListOverlay) {
        console.log("Creating Task List Overlay.");
        taskListOverlay = document.createElement('div');
        taskListOverlay.id = 'yt-task-overlay';
        // Base styles applied via styles.css

        taskListOverlay.innerHTML = `
            <div class="yt-task-overlay-header">
                <h3 class="yt-task-overlay-title">Course Tasks</h3>
                <button class="yt-task-overlay-close-btn" title="Close Task List">×</button>
            </div>
            <div id="yt-task-list">
                <!-- Task items will be injected here -->
            </div>
        `;
        document.body.appendChild(taskListOverlay);

        taskListOverlay.querySelector('.yt-task-overlay-close-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTaskListVisibility(false);
        });

    } else {
         console.log("Task List Overlay already exists.");
    }

    // Ensure visibility state is correct
    taskListOverlay.classList.toggle('hidden', !isTaskListVisible);
    updateTaskList(); // Populate with current data
}

function updateTaskList() {
    const taskListDiv = document.getElementById('yt-task-list');
    if (!taskListDiv || !player || totalChunks <= 0) return;

    taskListDiv.innerHTML = ''; // Clear previous items
    const currentTime = player.currentTime;

    for (let i = 0; i < totalChunks; i++) {
        const startTime = i * chunkSizeSeconds;
        // Ensure endTime doesn't exceed video duration
        const endTime = Math.min((i + 1) * chunkSizeSeconds, videoDuration);
        const isCompleted = i < completedChunks;
        // current chunk is where currentTime falls within its start/end
        const isCurrent = currentTime >= startTime && currentTime < endTime;

        const taskItem = document.createElement('div');
        taskItem.className = 'yt-task-item';
        if (isCompleted) taskItem.classList.add('completed');
        if (isCurrent) taskItem.classList.add('current');

        taskItem.innerHTML = `
            <span class="task-item-title">Task ${i + 1}</span>
            <span class="task-item-time">${formatTime(startTime)} - ${formatTime(endTime)}</span>
        `;

        taskItem.addEventListener('click', () => {
            console.log(`Task ${i + 1} clicked, seeking to ${startTime}`);
            player.currentTime = startTime;
             // handleSeek will manage progress update if needed
        });

        taskListDiv.appendChild(taskItem);

        // Scroll current task into view
        if (isCurrent) {
            // Use scrollIntoView with options for smoother scrolling if available
            taskItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
    }
     // console.log("Task list updated.");
}

function toggleTaskListVisibility(show) {
    const newState = show !== undefined ? show : !isTaskListVisible;
    if (newState === isTaskListVisible && taskListOverlay) return; // No change needed

    isTaskListVisible = newState;
    console.log(`Toggling task list visibility to: ${isTaskListVisible}`);

    if (!taskListOverlay) {
        createOrUpdateTaskListOverlay(); // Create if it doesn't exist
    } else {
        taskListOverlay.classList.toggle('hidden', !isTaskListVisible);
    }

    // Update toggle button state if it exists
    updateToggleButtonState();
}

// --- Player Button ---
function addOrUpdateToggleButtonToPlayer() {
    const controls = document.querySelector('.ytp-right-controls');
    if (!controls) {
        console.warn("Right controls not found, cannot add toggle button yet.");
        // Try again later maybe? Or rely on it being created by YT later.
        return;
    }

    taskListToggleBtn = controls.querySelector('.ytp-tasklist-toggle-button');

    if (!taskListToggleBtn) {
        console.log("Creating task list toggle button.");
        taskListToggleBtn = document.createElement('button');
        taskListToggleBtn.className = 'ytp-button ytp-tasklist-toggle-button'; // Add specific class
        taskListToggleBtn.title = 'Toggle Course Task List';
        // More distinct icon (e.g., checklist)
        taskListToggleBtn.innerHTML = `
            <svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%">
                <path fill="#fff" d="M22.5,11.5 L12.5,11.5 C11.95,11.5 11.5,11.95 11.5,12.5 L11.5,13.5 C11.5,14.05 11.95,14.5 12.5,14.5 L22.5,14.5 C23.05,14.5 23.5,14.05 23.5,13.5 L23.5,12.5 C23.5,11.95 23.05,11.5 22.5,11.5 Z M22.5,16.5 L12.5,16.5 C11.95,16.5 11.5,16.95 11.5,17.5 L11.5,18.5 C11.5,19.05 11.95,19.5 12.5,19.5 L22.5,19.5 C23.05,19.5 23.5,19.05 23.5,18.5 L23.5,17.5 C23.5,16.95 23.05,16.5 22.5,16.5 Z M22.5,21.5 L12.5,21.5 C11.95,21.5 11.5,21.95 11.5,22.5 L11.5,23.5 C11.5,24.05 11.95,24.5 12.5,24.5 L22.5,24.5 C23.05,24.5 23.5,24.05 23.5,23.5 L23.5,22.5 C23.5,21.95 23.05,21.5 22.5,21.5 Z M27,9 L9,9 C7.9,9 7,9.9 7,11 L7,25 C7,26.1 7.9,27 9,27 L27,27 C28.1,27 29,26.1 29,25 L29,11 C29,9.9 28.1,9 27,9 Z M27,25 L9,25 L9,11 L27,11 L27,25 Z"></path>
           </svg>
        `;
        // Styles like width/height are handled by ytp-button class

        taskListToggleBtn.addEventListener('click', () => {
            toggleTaskListVisibility();
        });

        // Insert before the settings button
        const settingsBtn = controls.querySelector('.ytp-settings-button');
        if (settingsBtn) {
            controls.insertBefore(taskListToggleBtn, settingsBtn);
        } else {
             // Fallback: append to the end if settings button not found
             controls.appendChild(taskListToggleBtn);
        }
    } else {
        console.log("Task list toggle button already exists.");
    }
    updateToggleButtonState();
}

function updateToggleButtonState() {
    if (!taskListToggleBtn) return;
    // Maybe add visual feedback like changing opacity or icon slightly
    taskListToggleBtn.style.opacity = isTaskListVisible ? '1' : '0.7';
    taskListToggleBtn.title = isTaskListVisible ? 'Hide Course Task List' : 'Show Course Task List';
}

// --- Confirmation Modals ---

function showRewatchConfirmation(targetChunkIndex) {
    if (isShowingModal) return; // Prevent multiple modals

    isShowingModal = true;
    player?.pause(); // Pause video during confirmation

    createModal(
        'Mark Tasks Incomplete?',
        `You've moved back to Task ${targetChunkIndex + 1}. Mark tasks ${targetChunkIndex + 2} onwards as incomplete?`,
        [
            {
                text: 'Yes, Mark Incomplete',
                action: () => {
                    console.log("Confirmed rewatch, marking subsequent tasks incomplete.");
                    completedChunks = targetChunkIndex + 1; // Mark *up to* the end of the target chunk
                    lastConfirmedChunkIndex = targetChunkIndex; // Update confirmed index
                    updateProgressMarkers();
                    updateTaskList();
                    saveProgress();
                    isShowingModal = false;
                },
                className: 'danger-btn'
            },
            {
                text: 'No, Keep Progress',
                action: () => {
                     console.log("Declined rewatch confirmation.");
                     // Don't change completedChunks, but update the confirmed index
                     lastConfirmedChunkIndex = targetChunkIndex;
                     updateTaskList(); // Update highlighting
                     isShowingModal = false;
                },
                 className: 'secondary-btn'
            }
        ],
        'warning' // Modal type
    );
}

function showCompletionConfirmation() {
    // We already checked !isShowingModal before calling this in handleTimeUpdate's debounce
    if (!player) return;

    isShowingModal = true; // Set flag immediately
    player.pause(); // Pause video

    console.log("Showing completion confirmation modal.");

    createModal(
        'Course Section Finished?',
        `You've reached the end of the video. Mark this section as fully complete?`,
        [
            {
                text: 'Yes, Complete!',
                action: () => {
                    console.log("Confirmed completion.");
                    completedChunks = totalChunks; // Mark all chunks complete
                    lastConfirmedChunkIndex = totalChunks - 1;
                    updateProgressMarkers();
                    updateTaskList();
                    saveProgress();
                    isShowingModal = false; // Reset flag before showing next modal
                    showCongratulatoryMessage();
                },
                className: 'success-btn'
            },
            {
                text: 'Not Yet',
                action: () => {
                    console.log("Declined completion.");
                    // Don't change progress, just close modal
                    isShowingModal = false; // Reset flag
                    // Optionally show encouragement? For now, just close.
                },
                className: 'secondary-btn'
            }
        ],
        'primary'
    );
}

function showCongratulatoryMessage() {
    if (isShowingModal) return; // Avoid stacking
    isShowingModal = true;
     console.log("Showing congratulatory message.");

    createModal(
        '🎉 Congratulations! 🎉',
        'Awesome work! You\'ve completed all tasks for this video section.',
        [
            {
                text: 'Great!',
                action: () => { isShowingModal = false; },
                className: 'success-btn'
            }
        ],
        'success'
    );
}

// Modal Creation/Removal (Improved)
let activeModal = null; // Track only one modal at a time

function createModal(title, message, buttons, type = 'primary') {
    // Remove any existing modal first
    removeActiveModal();

    console.log(`Creating modal: ${title}`);
    const modal = document.createElement('div');
    modal.className = `yt-course-modal ${type}`; // Use type for border accent

    modal.innerHTML = `
        <button class="yt-course-modal-close" title="Close">×</button>
        <h3 class="modal-title">${title}</h3>
        <p class="modal-message">${message}</p>
        <div class="modal-buttons">
            ${buttons.map(btn =>
                `<button class="modal-btn ${btn.className || 'primary-btn'}">${btn.text}</button>`
            ).join('')}
        </div>
    `;

    // Add event listeners
    modal.querySelector('.yt-course-modal-close').addEventListener('click', () => {
        removeActiveModal();
        // Default close action usually means 'No' or cancel
        if (type === 'warning') { // Rewatch confirmation
             // If closed without explicit choice, behave like 'No'
             const currentTime = player?.currentTime || 0;
             const targetChunkIndex = Math.floor(currentTime / chunkSizeSeconds);
             lastConfirmedChunkIndex = targetChunkIndex;
             updateTaskList();
        }
        isShowingModal = false; // Ensure flag is reset
    });

    buttons.forEach((btn, i) => {
        modal.querySelectorAll('.modal-btn')[i].addEventListener('click', () => {
            // Action function MUST handle resetting isShowingModal flag if needed
            btn.action();
             // Remove modal *after* action completes (action might show another modal)
             // Let the action function handle removal if it chains modals
             if (!isShowingModal) { // Only remove if action didn't keep a modal open
                removeActiveModal();
            }
        });
    });

    document.body.appendChild(modal);
    activeModal = modal;

     // Add styles if they weren't injected by manifest (fallback)
     if (!document.getElementById('yt-course-modal-style-injected')) {
        const styleCheck = document.createElement('style');
        styleCheck.id = 'yt-course-modal-style-injected';
        document.head.appendChild(styleCheck);
     }

    return modal;
}

function removeActiveModal() {
    if (activeModal && activeModal.parentNode) {
         console.log("Removing active modal.");
        activeModal.parentNode.removeChild(activeModal);
        activeModal = null;
        // Reset the flag ONLY if we are sure no other modal is intended to show immediately
        // The calling function or button action should manage the isShowingModal flag state.
    }
}


// --- Utilities ---
function formatTime(seconds) {
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// --- Message Handling (from Popup/Background) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Content script received message:", request);

    if (request.action === 'requestCurrentVideoState') {
        if (player && currentVideoId && videoDuration > 0) {
            sendResponse({
                success: true,
                videoData: {
                    videoId: currentVideoId,
                    title: currentVideoTitle,
                    totalChunks: totalChunks,
                    completedChunks: completedChunks,
                    chunkSizeMinutes: chunkSizeMinutes,
                    duration: videoDuration,
                    isTaskListVisible: isTaskListVisible
                }
            });
        } else {
            sendResponse({ success: false, error: "Player or video data not ready." });
        }
        return true; // Indicate async response potentially
    }
    else if (request.action === 'updateChunkSize') {
        const newSizeMinutes = parseInt(request.chunkSizeMinutes);
        if (!isNaN(newSizeMinutes) && newSizeMinutes > 0) {
            console.log(`Updating chunk size to ${newSizeMinutes} minutes.`);
            chunkSizeMinutes = newSizeMinutes;
            chunkSizeSeconds = newSizeMinutes * 60;
            // Recalculate everything based on the new size
            resetAndCalculateChunks();
            updateProgressMarkers();
            updateTaskList();
            saveProgress(); // Save the new state (including new total chunks/size)
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: "Invalid chunk size provided." });
        }
        return true;
    }
    else if (request.action === 'toggleTaskList') {
        toggleTaskListVisibility(); // Let the function handle the logic
        sendResponse({ success: true, visible: isTaskListVisible });
        return true;
    }

    // Add other message handlers if needed

    // Return false or nothing if not handled or synchronous
});

// --- Run Initialization ---
// Use a flag to prevent multiple initializations from potential script re-injections
if (!window.ytCourseChunkMasterInitialized) {
    window.ytCourseChunkMasterInitialized = true;

     // Observe for URL changes (YouTube SPA navigation)
     let lastUrl = location.href;
     new MutationObserver(() => {
       const url = location.href;
       if (url !== lastUrl) {
         lastUrl = url;
         console.log("URL changed, re-initializing extension for new page/video.");
          // Clear previous state carefully before re-init
          removeActiveModal(); // Clear modals
          isShowingModal = false;
          clearTimeout(completionCheckDebounceTimer);
          // Remove old markers? resetAndCalculateChunks does this.
         initializeExtension(); // Re-run initialization for the new video/page
       }
     }).observe(document, { subtree: true, childList: true });


    // Initial run
    // Use a small delay to allow YT player to potentially initialize first on load
    setTimeout(initializeExtension, 500);

} else {
    console.log("YT Course Chunk Master: Already initialized on this page.");
}