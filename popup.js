// popup.js

const VIDEO_LIST_KEY = 'videoList';
const SETTINGS_KEY = 'settings';

// --- DOM Elements ---
let loadingState, errorState, mainContent, currentVideoTitle, progressText,
    progressBar, completionEstimateLabel, completionEstimate, addVideoBtn,
    taskListToggleBtn, videoListContainer, videoListEmpty, chunkSizeInput,
    applyChunkSizeBtn, dailyGoalInput, saveDailyGoalBtn,
    enableRemindersToggle, reminderTimeInput, saveReminderSettingsBtn, statusMessage, darkModeToggle;

// --- State ---
let currentTabId = null;
let currentVideoData = null; // { videoId, title, totalChunks, completedChunks, chunkSizeMinutes }
let settings = null;
let videoList = [];
let contentScriptActive = false;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', initializePopup);

async function initializePopup() {
    mapDOMElements();
    showLoading();

    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0 || !tabs[0].id) {
           throw new Error("No active tab found.");
        }
        currentTabId = tabs[0].id;

        if (!tabs[0].url || !tabs[0].url.includes('youtube.com/watch')) {
             throw new Error("Not on a YouTube video page.");
        }

        // Load settings and video list first
        await loadDataFromStorage();
        setupEventListeners();
        updateSettingsUI(); // Display loaded settings

        // Now try to connect to content script
        sendContentScriptMessage({ action: 'requestCurrentVideoState' }, handleVideoStateResponse);

    } catch (error) {
        console.error("Popup initialization error:", error);
        showError(error.message);
    }
}

function mapDOMElements() {
    loadingState = document.getElementById('loading-state');
    errorState = document.getElementById('error-state');
    mainContent = document.getElementById('main-content');
    currentVideoTitle = document.getElementById('current-video-title');
    progressText = document.getElementById('progress-text');
    progressBar = document.getElementById('progress-bar');
    completionEstimateLabel = document.getElementById('completion-estimate-label');
    completionEstimate = document.getElementById('completion-estimate');
    addVideoBtn = document.getElementById('add-video-btn');
    taskListToggleBtn = document.getElementById('task-list-toggle');
    videoListContainer = document.getElementById('video-list-container');
    videoListEmpty = document.getElementById('video-list-empty');
    chunkSizeInput = document.getElementById('chunk-size-input');
    applyChunkSizeBtn = document.getElementById('apply-chunk-size-btn');
    dailyGoalInput = document.getElementById('daily-goal-input');
    saveDailyGoalBtn = document.getElementById('save-daily-goal-btn');
    enableRemindersToggle = document.getElementById('enable-reminders-toggle');
    reminderTimeInput = document.getElementById('reminder-time-input');
    saveReminderSettingsBtn = document.getElementById('save-reminder-settings-btn');
    statusMessage = document.getElementById('status-message');
    darkModeToggle = document.getElementById('dark-mode-toggle');
}

function setupEventListeners() {
    addVideoBtn.addEventListener('click', handleAddVideo);
    taskListToggleBtn.addEventListener('click', handleToggleTaskList);
    applyChunkSizeBtn.addEventListener('click', handleApplyChunkSize);
    saveDailyGoalBtn.addEventListener('click', handleSaveDailyGoal);
    saveReminderSettingsBtn.addEventListener('click', handleSaveReminderSettings);
    enableRemindersToggle.addEventListener('change', handleToggleReminderEnable); // Also trigger save on check change
    darkModeToggle.addEventListener('change', handleDarkModeToggle); // Add listener
}

// --- UI Update Functions ---

function showLoading() {
    loadingState.style.display = 'block';
    errorState.style.display = 'none';
    mainContent.style.display = 'none';
}

function showError(message) {
    loadingState.style.display = 'none';
    errorState.textContent = message;
    errorState.style.display = 'block';
    mainContent.style.display = 'none';
}

function showMainContent() {
    loadingState.style.display = 'none';
    errorState.style.display = 'none';
    mainContent.style.display = 'block';
}

function updateSettingsUI() {
    if (!settings) return;
    chunkSizeInput.value = settings.defaultChunkSizeMinutes || 5; // Use default if current video has none yet
    dailyGoalInput.value = settings.dailyGoalMinutes || 30;
    enableRemindersToggle.checked = settings.enableReminders ?? true; // Default to true if not set
    reminderTimeInput.value = settings.reminderTime || "09:00";
    reminderTimeInput.disabled = !enableRemindersToggle.checked;
    saveReminderSettingsBtn.disabled = !enableRemindersToggle.checked;
}

function updateCurrentVideoUI() {
    if (!contentScriptActive || !currentVideoData) {
        currentVideoTitle.textContent = 'Video data unavailable';
        progressText.textContent = 'N/A';
        progressBar.value = 0;
        progressBar.style.width = '0%';
        completionEstimate.textContent = 'N/A';
        addVideoBtn.disabled = true;
        taskListToggleBtn.disabled = true;
        applyChunkSizeBtn.disabled = true;
        // Keep settings enabled though
        return;
    }

    showMainContent(); // Ensure main content is visible

    currentVideoTitle.textContent = currentVideoData.title || 'Untitled Video';
    const percentage = currentVideoData.totalChunks > 0 ? Math.round((currentVideoData.completedChunks / currentVideoData.totalChunks) * 100) : 0;
    progressText.textContent = `${currentVideoData.completedChunks}/${currentVideoData.totalChunks} tasks (${percentage}%)`;
    progressBar.value = percentage;
    progressBar.style.width = `${percentage}%`; // For non-webkit browsers if needed

    // Update chunk size input specific to this video
    chunkSizeInput.value = currentVideoData.chunkSizeMinutes || settings.defaultChunkSizeMinutes;

    // Calculate completion estimate
    calculateCompletionEstimate();

    // Update Add/Remove Button
    const isVideoInList = videoList.some(v => v.videoId === currentVideoData.videoId);
    addVideoBtn.disabled = isVideoInList;
    addVideoBtn.innerHTML = isVideoInList
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"></path></svg> Added`
        : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2h6z"></path></svg> Add to List`;

    // Enable other buttons
    taskListToggleBtn.disabled = false;
    taskListToggleBtn.textContent = currentVideoData.isTaskListVisible ? 'Hide Task List' : 'Show Task List';
    applyChunkSizeBtn.disabled = false;
}


function calculateCompletionEstimate() {
    if (!currentVideoData || !settings?.dailyGoalMinutes || currentVideoData.totalChunks <= 0) {
        completionEstimate.textContent = 'N/A';
        completionEstimateLabel.style.display = 'none';
        return;
    }

    const remainingChunks = currentVideoData.totalChunks - currentVideoData.completedChunks;
    if (remainingChunks <= 0) {
        completionEstimate.textContent = 'Done!';
        completionEstimateLabel.style.display = 'inline';
        return;
    }

    const currentChunkSize = currentVideoData.chunkSizeMinutes || settings.defaultChunkSizeMinutes;
    const remainingMinutes = remainingChunks * currentChunkSize;
    const dailyGoal = settings.dailyGoalMinutes;

    const daysNeeded = Math.ceil(remainingMinutes / dailyGoal);

    if (daysNeeded === 1) {
         completionEstimate.textContent = `Today!`;
    } else if (daysNeeded > 0 && daysNeeded < 1000) { // Avoid huge numbers
        completionEstimate.textContent = `${daysNeeded} day${daysNeeded > 1 ? 's' : ''}`;
    } else if (daysNeeded >= 1000) {
        completionEstimate.textContent = `A while`;
    }
     else {
        completionEstimate.textContent = 'N/A'; // Should not happen if goal > 0
    }
     completionEstimateLabel.style.display = 'inline';
}


function renderVideoList() {
    videoListContainer.innerHTML = ''; // Clear existing items

    if (videoList.length === 0) {
        videoListEmpty.style.display = 'block';
        return;
    }

    videoListEmpty.style.display = 'none';
    videoList.sort((a, b) => (b.addedDate || 0) - (a.addedDate || 0)); // Show newest first

    videoList.forEach(video => {
        const item = document.createElement('div');
        item.className = 'video-list-item';
        item.dataset.videoId = video.videoId;

        const percentage = video.totalChunks > 0 ? Math.round((video.completedChunks / video.totalChunks) * 100) : 0;

        item.innerHTML = `
            <div class="video-item-info">
                <span class="video-item-title">${video.title || 'Untitled Video'}</span>
                <span class="video-item-progress">
                    ${video.completedChunks}/${video.totalChunks} tasks (<strong>${percentage}%</strong>) - ${video.chunkSizeMinutes} min chunks
                </span>
            </div>
            <div class="video-item-actions">
                <button class="remove-video-btn" title="Remove from list">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"></path></svg>
                </button>
            </div>
        `;

        item.querySelector('.remove-video-btn').addEventListener('click', () => handleRemoveVideo(video.videoId));
        videoListContainer.appendChild(item);
    });
}

// --- Event Handlers ---

function handleAddVideo() {
    if (!currentVideoData || !currentVideoData.videoId) {
        showStatus('Cannot add video: No video data found.', 'error');
        return;
    }

    const videoToAdd = {
        videoId: currentVideoData.videoId,
        title: currentVideoData.title,
        totalChunks: currentVideoData.totalChunks,
        completedChunks: currentVideoData.completedChunks,
        chunkSizeMinutes: currentVideoData.chunkSizeMinutes || settings.defaultChunkSizeMinutes,
        addedDate: Date.now() // Store added date
    };

    videoList = [...videoList.filter(v => v.videoId !== videoToAdd.videoId), videoToAdd]; // Add or update
    saveDataToStorage(); // Saves videoList and settings
    renderVideoList();
    updateCurrentVideoUI(); // Update button state
    showStatus(`"${truncate(videoToAdd.title)}" added to list!`, 'success');
}

async function handleRemoveVideo(videoId) {
    videoList = videoList.filter(v => v.videoId !== videoId);
    await saveDataToStorage(); // Save updated list
    renderVideoList();
    // If the removed video is the current one, update the button
    if (currentVideoData && currentVideoData.videoId === videoId) {
        updateCurrentVideoUI();
    }
     showStatus('Video removed from list.', 'info');
}

function handleToggleTaskList() {
    sendContentScriptMessage({ action: 'toggleTaskList' }, (response) => {
        if (response && response.visible !== undefined) {
             taskListToggleBtn.textContent = response.visible ? 'Hide Task List' : 'Show Task List';
             if(currentVideoData) currentVideoData.isTaskListVisible = response.visible; // Update local state too
        }
    });
}

function handleApplyChunkSize() {
    const newSize = parseInt(chunkSizeInput.value);
    if (isNaN(newSize) || newSize < 1 || newSize > 120) {
        showStatus('Invalid chunk size (1-120 min).', 'error');
        return;
    }

    // Update content script for the current video immediately
    sendContentScriptMessage({ action: 'updateChunkSize', chunkSizeMinutes: newSize }, (response) => {
        if (response?.success) {
            // Update local state and UI
             if(currentVideoData) {
                 currentVideoData.chunkSizeMinutes = newSize;
                 // We need to wait for the content script to recalculate chunks
                 // Let's re-request state after a short delay
                 setTimeout(() => {
                     sendContentScriptMessage({ action: 'requestCurrentVideoState' }, handleVideoStateResponse);
                 }, 300);
             }

            // Also update the stored value for *this specific video* if it's in the list
            const index = videoList.findIndex(v => v.videoId === currentVideoData?.videoId);
            if (index > -1) {
                videoList[index].chunkSizeMinutes = newSize;
                saveDataToStorage(); // Save updated video list
                renderVideoList(); // Re-render to show new chunk size
            }
             showStatus(`Chunk size updated to ${newSize} min for this video.`, 'success');
        } else {
            showStatus('Failed to apply chunk size.', 'error');
        }
    });
}


async function handleSaveDailyGoal() {
    const newGoal = parseInt(dailyGoalInput.value);
    if (isNaN(newGoal) || newGoal < 5 || newGoal > 300) {
        showStatus('Invalid daily goal (5-300 min).', 'error');
        // Restore previous value?
        dailyGoalInput.value = settings.dailyGoalMinutes;
        return;
    }

    settings.dailyGoalMinutes = newGoal;
    await saveDataToStorage();
    calculateCompletionEstimate(); // Recalculate estimate
    showStatus('Daily goal saved!', 'success');
     // No need to notify background - goal is used locally in popup and potentially by background on alarm trigger
}

async function handleSaveReminderSettings() {
    const time = reminderTimeInput.value;
    const enabled = enableRemindersToggle.checked;

     // Basic time validation (HH:MM format)
    if (!/^\d{2}:\d{2}$/.test(time)) {
        showStatus('Invalid time format (HH:MM).', 'error');
        reminderTimeInput.value = settings.reminderTime; // Restore previous
        return;
    }

    settings.enableReminders = enabled;
    settings.reminderTime = time;

    await saveDataToStorage();
    showStatus('Reminder settings saved!', 'success');

    // Notify background script to reschedule alarms
    chrome.runtime.sendMessage({ action: 'rescheduleReminders' }, (response) => {
        if (response?.success) {
            console.log("Background confirmed reminder reschedule.");
        } else {
            console.error("Background failed to reschedule reminders:", response?.error);
            showStatus('Could not update reminder schedule.', 'error');
        }
    });

    // Update UI state
    reminderTimeInput.disabled = !enabled;
    saveReminderSettingsBtn.disabled = !enabled;
}

async function handleToggleReminderEnable() {
     // This implicitly triggers a save because the save button covers both
     await handleSaveReminderSettings();
}


// --- Data Handling ---

async function loadDataFromStorage() {
    const result = await chrome.storage.local.get([SETTINGS_KEY, VIDEO_LIST_KEY]);
    settings = result[SETTINGS_KEY] || { // Provide defaults if storage is empty
         defaultChunkSizeMinutes: 5,
         dailyGoalMinutes: 30,
         enableReminders: true,
         reminderTime: "09:00",
         darkMode: false
    
     };
    settings.darkMode = settings.darkMode ?? false;
    videoList = result[VIDEO_LIST_KEY] || [];
    applyDarkModePreference();
    renderVideoList(); // Render the list after loading
    console.log("Loaded settings:", settings);
    console.log("Loaded video list:", videoList);
}

// --- Add New Function: applyDarkModePreference ---
function applyDarkModePreference() {
    if (settings.darkMode) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
    // Sync checkbox state
    if (darkModeToggle) { // Check if element exists
        darkModeToggle.checked = settings.darkMode;
    }
}

// --- Add New Handler: handleDarkModeToggle ---
async function handleDarkModeToggle() {
    const isEnabled = darkModeToggle.checked;
    settings.darkMode = isEnabled; // Update settings object

    applyDarkModePreference(); // Apply change visually immediately

    await saveDataToStorage(); // Save the updated settings object
    // Optional: show status message
    // showStatus(`Dark mode ${isEnabled ? 'enabled' : 'disabled'}.`, 'info');
    console.log("Dark mode toggled:", isEnabled);
}

async function saveDataToStorage() {
    await chrome.storage.local.set({
        [SETTINGS_KEY]: settings,
        [VIDEO_LIST_KEY]: videoList
    });
     console.log("Saved settings and video list to storage.");
}

// --- Communication with Content Script ---

// Wrapper for sending messages to content script with timeout and error handling
function sendContentScriptMessage(message, callback) {
    if (!currentTabId) {
        console.error("No active tab ID to send message.");
        if (callback) callback(null); // Indicate failure
        return;
    }

    const timeout = 5000; // 5 seconds timeout
    let responded = false;

    const timer = setTimeout(() => {
        if (!responded) {
            console.warn(`Message to content script timed out:`, message);
            contentScriptActive = false;
            updateCurrentVideoUI(); // Reflect inactive state
            if (callback) callback(null); // Indicate failure due to timeout
        }
    }, timeout);

    chrome.tabs.sendMessage(currentTabId, message, (response) => {
        clearTimeout(timer);
        responded = true;
        if (chrome.runtime.lastError) {
            console.warn(`Error sending message to content script: ${chrome.runtime.lastError.message}. Assuming inactive.`);
            contentScriptActive = false;
            updateCurrentVideoUI();
            if (callback) callback(null); // Indicate failure
        } else {
            // console.log('Received response from content script:', response);
             contentScriptActive = true; // Mark as active on successful response
             if (callback) callback(response);
        }
    });
}

// Specific handler for the initial video state request
function handleVideoStateResponse(response) {
    if (response && response.videoData) {
        contentScriptActive = true;
        currentVideoData = response.videoData;
        updateCurrentVideoUI();
        console.log("Received video state:", currentVideoData);
    } else {
        contentScriptActive = false;
        // If we failed to get data but thought we were on a video page, show error
        if (document.getElementById('error-state').style.display !== 'block') {
             showError("Couldn't retrieve video data. Try refreshing the YouTube page.");
        }
        console.log("Content script did not provide video data or is inactive.");
    }
}


// --- Utility Functions ---

function showStatus(message, type = 'info') { // types: info, success, error
    statusMessage.textContent = message;
    statusMessage.className = `message ${type}`; // Reset classes and add type
    statusMessage.style.display = 'block';

    // Clear the message after a few seconds
    setTimeout(() => {
        if (statusMessage.textContent === message) { // Only clear if it's the same message
             statusMessage.style.display = 'none';
             statusMessage.textContent = '';
             statusMessage.className = 'message';
        }
    }, 3000);
}

function truncate(str, maxLength = 30) {
    if (!str) return "";
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

// Listen for updates pushed from content script (e.g., progress changes)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'videoProgressUpdate') {
        // Check if the update is from the relevant tab
        if (sender.tab && sender.tab.id === currentTabId && currentVideoData) {
            console.log("Popup received progress update from content script:", request.data);
            currentVideoData.completedChunks = request.data.completedChunks;
            currentVideoData.totalChunks = request.data.totalChunks; // Update total in case it changed (rare)

            // Update UI immediately
            updateCurrentVideoUI();

            // Also update the video list in storage if this video is tracked
            const index = videoList.findIndex(v => v.videoId === currentVideoData.videoId);
            if (index > -1) {
                videoList[index].completedChunks = currentVideoData.completedChunks;
                videoList[index].totalChunks = currentVideoData.totalChunks;
                saveDataToStorage(); // Save updated list (debouncing could be added here if needed)
                renderVideoList(); // Re-render list to show updated progress
            }
        }
        return true; // Indicate message processed (optional async handling)
    }
});