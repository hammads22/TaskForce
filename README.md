# ⚡ Taskforce

> **Per-org task manager for Salesforce.** Auto-detects your active Salesforce environment and keeps your tasks isolated where they belong.

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-0F9D58?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Version](https://img.shields.io/badge/Version-3.2-blue?style=flat-square)](./manifest.json)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](./LICENSE)

---

## 🌟 Key Features

- **🌐 Automatic Org Detection**: Automatically detects Salesforce instances (`*.my.salesforce.com`, `*.lightning.force.com`, sandboxes, etc.) based on your active tab and switches task views dynamically.
- **📋 Isolated Task Lists**: Every Salesforce org maintains its own isolated task list, preventing cross-org confusion for consultants and admins managing multiple environments.
- **📊 Cross-Org Dashboard**: A unified global view displaying active tasks across all your Salesforce orgs, with quick org switching and priority cycling.
- **🚥 Status Workflow & Priorities**: Flexible task status tracking (`Active`, `Waiting`, `Blocked`, `Done`) combined with priority tagging (`High`, `Medium`, `Low`) and customizable color tags.
- **⏰ Smart Due Dates**: Set due dates with dynamic badges for `Overdue`, `Today`, `Tomorrow`, and upcoming items.
- **🔍 Advanced Filtering & Search**: Instant full-text search across titles and notes, combined with status chips and due-date filters.
- **💾 Import & Export Options**:
  - Export task backups (Single Org or All Orgs) as JSON.
  - Import JSON task backups with automatic duplicate merging.
  - Quick-copy active tasks as a formatted plain-text list to your clipboard.
- **🎨 Modern Dark/Light Theme & Dynamic Scaling**: Supports dark, light, and system themes with full font-size accessibility scaling and customizable keyboard shortcuts.

---

## ⌨️ Keyboard Shortcuts

Taskforce includes powerful keyboard navigation built into the side panel:

| Action | Default Key Combo |
| :--- | :--- |
| **Move Focus Down** | `J` |
| **Move Focus Up** | `K` |
| **Open Task Detail / Expand** | `Enter` |
| **Focus Search Bar** | `/` |
| **Toggle Status Filter** | `S` |
| **Clear All Filters** | `Esc` |
| **Cycle Task Status** | `Ctrl` + `.` |
| **Open Org Switcher (Dashboard)** | `Ctrl` + `O` |
| **Toggle Due Date Filter** | `D` |
| **Quick-Create Task** | `N` |

*Shortcuts can be customized or rebound anytime in **Settings (⚙)**.*

---

## 🚀 Installation

### Load Unpacked Extension (Developer Mode)

1. Clone or download this repository to your local machine:
   ```bash
   git clone https://github.com/hammads22/Taskforce.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked**.
5. Select the project directory (`sftasks-v3`).
6. Click the extension icon or open Chrome Side Panel (`Ctrl` + `Shift` + `S` or `Cmd` + `Shift` + `S`) to start using Taskforce!

---

## 📁 Project Structure

```
sftasks-v3/
├── manifest.json       # Extension Manifest V3 configuration
├── background.js       # Background service worker (Side Panel launcher)
├── sidepanel.html      # Primary Side Panel UI structure
├── sidepanel.js        # Main Taskforce app logic (Org detection, CRUD, DnD, Dashboard)
├── sidepanel.css       # Responsive design system & theme variables
├── settings.html       # Options page UI
├── settings.js         # Settings logic (Theme, Shortcuts, Custom Bindings)
├── settings.css        # Settings page layout & tokens
└── icons/              # Extension icons (16px, 48px, 128px)
```

---

## 🔐 Privacy & Security

- **100% Local Storage**: All tasks, custom notes, org labels, and preferences are stored exclusively on your device via `chrome.storage.local`.
- **Zero External Tracking**: No telemetry, analytics, or external API calls. Your Salesforce data and task lists remain completely private.

---

## 👨‍💻 Author

Developed by **Hammad Shahid**  
📧 Email: hashahid3d@gmail.com  
🐙 GitHub: [@hammads22](https://github.com/hammads22)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
