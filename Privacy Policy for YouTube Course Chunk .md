Privacy Policy for YouTube Course Chunk Master

1. Introduction

Thank you for using YouTube Course Chunk Master ("the Extension"). This Privacy Policy explains how Ajay Dhiman ("we," "us," or "our") collects, uses, and protects information in relation to our Chrome extension. Your privacy is important to us.

2. Information We Collect

The Extension collects the following types of information solely for the purpose of providing its core functionality:

Locally Stored Progress Data:

YouTube Video IDs: To associate progress with specific videos.

Video Chunk Completion Status: Boolean flags (true/false) indicating whether each chunk of a tracked video has been completed.

Video Title: The title of the YouTube video, read directly from the YouTube page, associated with the saved progress.

Video Duration & User-Set Chunk Size: Used to calculate chunks and validate saved progress.

Timestamps: A timestamp indicating when progress was last saved.

How Collected: Automatically generated and updated by the extension as you watch videos on youtube.com/watch* pages.

Storage: This data is stored locally on your device using chrome.storage.local. It is not transmitted off your device by the current version of the extension unless you use Chrome's sync feature (see below).

Synced Settings Data:

User Chunk Size Preference: The chunk duration (in minutes) set by the user in the extension popup.

How Collected: Entered by the user via the extension popup.

Storage: This setting is stored using chrome.storage.sync. If you are signed into Chrome and have extension syncing enabled, this setting may be synced across your devices via your Google account, subject to Google's privacy policy.

[Future Feature] User Authentication and Synced Progress Data:

Note: This section describes data handling for a planned future feature involving synchronization with a mobile application via Firebase. This feature is not yet implemented.

User Identifiers: If you choose to use the future sync feature, we will collect authentication information, such as a unique User ID provided by the authentication service (e.g., Firebase Authentication, Google Sign-In) and potentially your email address or name associated with that account.

Authentication Status/Tokens: Information required to keep you logged in and securely communicate with our backend service (Firebase).

Synced Progress Data: The Locally Stored Progress Data described above (Video IDs, chunk completion, title, duration, chunk size, timestamp) will be transmitted and stored on our backend service (Firebase Firestore) associated with your User Identifier to enable cross-device synchronization.

How Collected: Collected via the chosen authentication provider (e.g., Google Sign-In flow) when you opt-in to the sync feature, and automatically transmitted by the extension when progress updates occur while logged in.

Storage: This data will be stored securely on backend servers managed by Google Cloud Platform via Firebase services (Firestore and Authentication).

Non-Personal Data:

The extension may interact with standard browser APIs which could involve non-personal technical data (like browser version), but the extension itself does not explicitly collect or transmit this for tracking purposes separate from the core functionality.

3. How We Use Your Information

We use the collected information solely for the following purposes:

To provide the core functionality of dividing YouTube videos into chunks and tracking your viewing progress.

To save and restore your progress on specific videos across browser sessions (via chrome.storage.local).

To save and sync your preferred chunk size setting (via chrome.storage.sync).

[Future Feature] To authenticate you and securely sync your video progress data across devices (browser extension and planned mobile app) via Firebase services.

To provide notifications about task and course completion.

4. Data Sharing and Third Parties

We do not sell or rent your personal data to third parties.

Local Data (chrome.storage.local): This data remains on your device and is not shared by us.

Synced Settings (chrome.storage.sync): This data is handled by Google's Chrome sync infrastructure according to their privacy policy. We do not have access to the raw synced data on Google's servers.

[Future Feature] Firebase Services: For the planned sync feature, we will use Firebase (a Google service) for authentication and data storage (Firestore). Data stored on Firebase (User ID, Auth Info, Progress Data) is subject to Firebase's and Google Cloud's security practices and privacy policies. We use Firebase solely as a technical backend provider to enable the sync functionality. We will not share this data with other third parties beyond what is necessary to provide the service via Firebase. You can review Firebase/Google Cloud privacy policies for more information.

Aggregated/Anonymized Data: We currently do not collect aggregated or anonymized usage data. If this changes in the future, this policy will be updated.

5. Data Security

We take reasonable steps to protect the information we handle:

Progress data stored locally via chrome.storage.local is protected by standard browser security mechanisms.

Synced settings via chrome.storage.sync are handled by Google's infrastructure.

[Future Feature] Data stored in Firebase for the sync feature will rely on Google Cloud's security infrastructure and standard security practices (like secure connections - HTTPS).

We only collect data essential for the extension's functionality.

However, please be aware that no method of transmission over the Internet or method of electronic storage is 100% secure.

6. Data Retention

Local Data (chrome.storage.local): Data persists on your device until you manually clear your browser's extension data or uninstall the Extension.

Synced Settings (chrome.storage.sync): Data persists as managed by Chrome sync until you clear it or disable sync.

[Future Feature] Firebase Data: Data associated with your account (User ID, Progress Data) will be retained on Firebase servers as long as your account is active or until you request deletion. We will provide a mechanism for account/data deletion requests when this feature is implemented.

7. User Rights and Choices

You can clear locally stored progress data by clearing browsing data for extensions in Chrome's settings or by uninstalling the Extension.

You can clear synced settings data via Chrome's sync settings (chrome.storage.sync.clear() can also be called programmatically if needed, or by resetting sync).

[Future Feature] When the sync feature is implemented, you will have the option to not use it. If you do use it, you will have the right to request access to or deletion of your account data stored on Firebase by contacting us via the methods below.

8. Children's Privacy

The Extension is not intended for use by children under the age of 13 (or the relevant age in your jurisdiction). We do not knowingly collect personal information from children under 13. If we become aware that we have collected personal information from a child under 13, we will take steps to delete such information.

9. Changes to This Privacy Policy

We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy via the link provided in the Chrome Web Store listing. You are advised to review this Privacy Policy periodically for any changes. Changes to this Privacy Policy are effective when they are posted.

10. Contact Us

If you have any questions about this Privacy Policy, please contact us at:

Email: ajaynatsu@gmail.com


