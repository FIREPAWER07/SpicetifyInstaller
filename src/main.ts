import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DropdownHandler } from "./dropdown-handler";

interface SpicetifyCommand {
  name: string;
  command: string;
  description: string;
}

interface VersionInfo {
  installerVersion: string;
  spicetifyVersion: string | null;
  hasInstallerUpdate: boolean;
  hasSpicetifyUpdate: boolean;
  latestInstallerVersion: string | null;
  latestInstallerUrl: string | null;
}

class SpicetifyInstallerApp {
  private commandDisplay: HTMLElement;
  private executeButton: HTMLButtonElement;
  private outputElement: HTMLElement;
  private outputCard: HTMLElement;
  private clearOutputButton: HTMLElement;
  private progressContainer: HTMLElement;
  private progressBar: HTMLElement;
  private progressPercentage: HTMLElement;
  private faqButton: HTMLElement;
  private faqModal: HTMLElement;
  private closeFaqButton: HTMLElement;
  private appVersionElement: HTMLElement;
  private spicetifyVersionElement: HTMLElement;
  private updateNotificationElement: HTMLElement;
  private footerVersionElement: HTMLElement;
  private updateModal: HTMLElement | null = null;

  private dropdownHandler: DropdownHandler;

  private selectedCommand: string | null = null;
  private isExecuting = false;
  private currentProgress = 0;
  private progressInterval: number | null = null;
  private progressListener: any = null;

  private commands: SpicetifyCommand[] = [
    {
      name: "INSTALL",
      command:
        "iwr -useb https://raw.githubusercontent.com/spicetify/spicetify-cli/master/install.ps1 | iex",
      description: "Installs or updates Spicetify CLI on your system",
    },
    {
      name: "REPAIR",
      command: "spicetify restore backup apply",
      description: "Restores from backup and applies Spicetify",
    },
    {
      name: "BACKUP",
      command: "spicetify backup",
      description: "Creates a backup of your Spotify installation",
    },
    {
      name: "UNINSTALL",
      command:
        'spicetify restore; Remove-Item -Path "$env:APPDATA\\spicetify" -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -Path "$env:LOCALAPPDATA\\spicetify" -Recurse -Force -ErrorAction SilentlyContinue',
      description:
        "Completely removes Spicetify and restores Spotify to its original state",
    },
  ];

  constructor() {
    this.initElements();

    // Initialize the dropdown handler
    this.dropdownHandler = new DropdownHandler((optionName, command) => {
      this.selectOption(optionName, command);
    });

    this.initEventListeners();
    this.createUpdateModal();
    this.runInitialDiagnostic();
  }

  private initElements(): void {
    this.commandDisplay = document.getElementById("command-display")!;
    this.executeButton = document.getElementById(
      "execute-button"
    ) as HTMLButtonElement;
    this.outputElement = document.getElementById("output")!;
    this.outputCard = document.getElementById("output-card")!;
    this.clearOutputButton = document.getElementById("clear-output")!;
    this.progressContainer = document.getElementById("progress-container")!;
    this.progressBar = document.getElementById("progress-bar")!;
    this.progressPercentage = document.getElementById("progress-percentage")!;
    this.faqButton = document.getElementById("open-faq")!;
    this.faqModal = document.getElementById("faq-modal")!;
    this.closeFaqButton = document.getElementById("close-faq")!;
    this.appVersionElement = document.getElementById("app-version")!;
    this.spicetifyVersionElement =
      document.getElementById("spicetify-version")!;
    this.updateNotificationElement = document.getElementById(
      "update-notification"
    )!;
    this.footerVersionElement = document.getElementById("footer-version")!;

    this.appVersionElement.textContent = "Loading app version...";
    this.spicetifyVersionElement.textContent = "Checking Spicetify version...";
    this.footerVersionElement.textContent = "Loading...";
  }

  // Update the createUpdateModal method to include better styling
  private createUpdateModal(): void {
    // Create modal if it doesn't exist
    if (!document.getElementById("update-modal")) {
      const modal = document.createElement("div");
      modal.id = "update-modal";
      modal.className = "modal hidden";

      modal.innerHTML = `
      <div class="modal-content update-modal-content">
        <div class="modal-header">
          <h2 id="update-modal-title">Update Available</h2>
          <button id="close-update-modal" class="close-button">
            <span class="material-icons">close</span>
          </button>
        </div>
        <div class="modal-body">
          <div id="update-modal-message">An update is available.</div>
          <div class="update-actions">
            <button id="update-download-btn" class="update-btn">
              <span class="material-icons">download</span>
              Download Update
            </button>
            <button id="update-cancel-btn" class="cancel-btn">
              <span class="material-icons">close</span>
              Remind Me Later
            </button>
          </div>
        </div>
      </div>
    `;

      document.body.appendChild(modal);

      // Add event listeners
      document
        .getElementById("close-update-modal")!
        .addEventListener("click", () => {
          this.closeUpdateModal();
        });

      document
        .getElementById("update-cancel-btn")!
        .addEventListener("click", () => {
          this.closeUpdateModal();
        });

      document
        .getElementById("update-download-btn")!
        .addEventListener("click", () => {
          this.downloadUpdate();
        });

      // Close when clicking outside
      modal.addEventListener("click", (event) => {
        if (event.target === modal) {
          this.closeUpdateModal();
        }
      });

      this.updateModal = modal;
    } else {
      this.updateModal = document.getElementById("update-modal");
    }
  }

  // Update the showUpdateModal method to create a more attractive update modal
  private showUpdateModal(
    type: "installer" | "spicetify",
    version: string
  ): void {
    if (!this.updateModal) {
      this.createUpdateModal();
    }

    const title = document.getElementById("update-modal-title")!;
    const message = document.getElementById("update-modal-message")!;

    if (type === "installer") {
      title.textContent = "Installer Update Available";
      message.innerHTML = `
      <div class="update-info-container">
        <div class="update-icon">
          <span class="material-icons">system_update</span>
        </div>
        <div class="update-details">
          <p class="update-intro">A new version of the Spicetify Installer is available!</p>
          <div class="version-comparison">
            <div class="current-version">
              <span class="version-label">Current version:</span>
              <span class="version-value">${this.appVersionElement.textContent?.replace(
                "App ",
                ""
              )}</span>
            </div>
            <div class="version-arrow">
              <span class="material-icons">arrow_forward</span>
            </div>
            <div class="latest-version">
              <span class="version-label">Latest version:</span>
              <span class="version-value">v${
                version.includes("-Alpha") ? version : `${version}-Alpha`
              }</span>
            </div>
          </div>
          <p class="update-benefits">
            This update includes bug fixes, performance improvements, and new features.
          </p>
        </div>
      </div>
    `;
    } else {
      title.textContent = "Spicetify Update Available";
      message.innerHTML = `
      <div class="update-info-container">
        <div class="update-icon">
          <span class="material-icons">update</span>
        </div>
        <div class="update-details">
          <p class="update-intro">A new version of Spicetify is available!</p>
          <p class="update-benefits">
            Updating Spicetify ensures you have the latest features and compatibility with Spotify.
          </p>
        </div>
      </div>
    `;
    }

    this.updateModal!.classList.remove("hidden");
    setTimeout(() => {
      this.updateModal!.classList.add("visible");
    }, 10);
  }

  private closeUpdateModal(): void {
    if (this.updateModal) {
      this.updateModal.classList.remove("visible");
      setTimeout(() => {
        this.updateModal!.classList.add("hidden");
      }, 300);
    }
  }

  private async downloadUpdate(): Promise<void> {
    this.closeUpdateModal();

    try {
      const versionInfo = await invoke<VersionInfo>("check_versions");

      if (versionInfo.hasInstallerUpdate) {
        this.outputCard.classList.remove("hidden");
        setTimeout(() => {
          this.outputCard.classList.add("visible");
        }, 10);

        this.progressContainer.classList.remove("hidden");
        this.updateProgressBar(0);

        this.appendOutput("Starting automatic update download...\n");

        try {
          await invoke("download_update");
          this.appendOutput(
            "Update download started. The application will restart automatically.\n"
          );
          this.updateProgressBar(100);
        } catch (error) {
          this.appendOutput(
            `Failed to download update automatically: ${error}\n`
          );
          this.appendOutput("Opening manual download page...\n");
          await invoke("open_download_url");
        }
      } else if (versionInfo.hasSpicetifyUpdate) {
        this.selectOption("INSTALL", this.commands[0].command);
        await this.executeCommand();
      }
    } catch (error) {
      console.error("Error handling update:", error);
      this.appendOutput(`Error handling update: ${error}\n`);
    }
  }

  private initEventListeners(): void {
    this.executeButton.addEventListener("click", () => {
      if (!this.isExecuting) {
        this.executeCommand();
      }
    });

    this.clearOutputButton.addEventListener("click", () => {
      this.clearOutput();
    });

    this.faqButton.addEventListener("click", () => {
      this.openFaqUrl();
    });

    this.closeFaqButton.addEventListener("click", () => {
      this.closeFaqModal();
    });

    this.faqModal.addEventListener("click", (event) => {
      if (event.target === this.faqModal) {
        this.closeFaqModal();
      }
    });

    this.updateNotificationElement.addEventListener("click", () => {
      this.handleUpdateClick();
    });

    this.spicetifyVersionElement.addEventListener("click", () => {
      this.handleSpicetifyVersionClick();
    });
  }

  private async runInitialDiagnostic(): Promise<void> {
    try {
      this.outputCard.classList.remove("hidden");
      setTimeout(() => {
        this.outputCard.classList.add("visible");
      }, 10);

      this.outputElement.textContent = "";
      this.appendOutput("Diagnosing Spicetify installation...\n\n");

      const locationInfo = await invoke<string>("check_spicetify_location");
      this.appendOutput(locationInfo);

      try {
        const output = await invoke<string>("execute_powershell_command", {
          command:
            "try { spicetify -v } catch { Write-Output 'Command failed' }",
        });
        this.appendOutput("\nSpicetify version command output:\n" + output);
      } catch (error) {
        this.appendOutput("\nFailed to run spicetify command: " + error);
      }

      await this.checkVersions();
    } catch (error) {
      console.error("Diagnosis error:", error);
      this.appendOutput("\nDiagnosis failed: " + error);
      await this.checkVersions();
    }
  }

  private selectOption(optionName: string, command: string): void {
    this.selectedCommand = command;
    this.commandDisplay.textContent = `> ${command}`;
    this.executeButton.disabled = false;
  }

  private async executeCommand(): Promise<void> {
    if (!this.selectedCommand || this.isExecuting) return;

    this.isExecuting = true;

    this.outputCard.classList.remove("hidden");
    setTimeout(() => {
      this.outputCard.classList.add("visible");
    }, 10);

    this.progressContainer.classList.remove("hidden");
    this.currentProgress = 0;
    this.updateProgressBar(0);

    this.executeButton.disabled = true;
    const originalButtonText = this.executeButton.innerHTML;
    this.executeButton.innerHTML = '<div class="loading"></div> Executing...';

    this.outputElement.textContent = "";

    this.appendOutput(`> ${this.selectedCommand}\n\n`);

    try {
      this.setupProgressListener();

      // Fix for repair command - ensure correct order of operations
      if (this.selectedCommand.includes("restore backup apply")) {
        await this.executeFixedRepairCommand();
      } else {
        await this.executeCommandWithTauri(this.selectedCommand);
      }

      this.completeProgress();

      this.appendOutput(
        "\n<span class='success-text'>[SUCCESS] Command executed successfully!</span>\n"
      );

      await this.checkVersions();
    } catch (error) {
      this.completeProgress();
      this.appendOutput(`\n<span class='error-text'>[ERROR] ${error}</span>\n`);
    } finally {
      this.executeButton.innerHTML = originalButtonText;
      this.executeButton.disabled = false;
      this.isExecuting = false;

      this.removeProgressListener();
    }
  }

  // New method to fix the repair command execution
  private async executeFixedRepairCommand(): Promise<void> {
    try {
      // First restore from backup
      this.appendOutput("Step 1: Restoring from backup...\n");
      await this.executeCommandWithTauri("spicetify restore");

      // Then create a new backup
      this.appendOutput("\nStep 2: Creating a new backup...\n");
      await this.executeCommandWithTauri("spicetify backup");

      // Finally apply the customizations
      this.appendOutput("\nStep 3: Applying Spicetify customizations...\n");
      await this.executeCommandWithTauri("spicetify apply");
    } catch (error) {
      throw new Error(`Repair process failed: ${error}`);
    }
  }

  private async setupProgressListener(): Promise<void> {
    this.progressListener = await listen("progress_update", (event: any) => {
      const progress = event.payload as number;
      this.updateProgressBar(progress);
    });
  }

  private removeProgressListener(): void {
    if (this.progressListener) {
      this.progressListener();
      this.progressListener = null;
    }
  }

  private async executeCommandWithTauri(command: string): Promise<void> {
    try {
      console.log("Executing command:", command);
      const output = await invoke<string>("execute_powershell_command", {
        command,
      });
      console.log("Command output:", output);
      this.appendOutput(`[PowerShell Output]\n${output}\n`);
    } catch (error) {
      console.error("Error executing command:", error);
      throw new Error(`${error}`);
    }
  }

  private completeProgress(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }

    this.updateProgressBar(100);

    setTimeout(() => {
      this.progressContainer.classList.add("hidden");
    }, 1000);
  }

  private updateProgressBar(percentage: number): void {
    this.progressBar.style.width = `${percentage}%`;
    this.progressPercentage.textContent = `${Math.round(percentage)}%`;
  }

  private appendOutput(text: string): void {
    this.outputElement.innerHTML += text;
    this.outputElement.scrollTop = this.outputElement.scrollHeight;
  }

  private clearOutput(): void {
    this.outputElement.textContent = "";
  }

  private async openFaqUrl(): Promise<void> {
    try {
      await invoke("open_faq_url");
    } catch (error) {
      console.error("Error opening FAQ URL:", error);
      this.openFaqModal();
    }
  }

  private openFaqModal(): void {
    this.faqModal.classList.remove("hidden");
    setTimeout(() => {
      this.faqModal.classList.add("visible");
    }, 10);
  }

  private closeFaqModal(): void {
    this.faqModal.classList.remove("visible");
    setTimeout(() => {
      this.faqModal.classList.add("hidden");
    }, 300);
  }

  private async checkVersions(): Promise<void> {
    try {
      const versionInfo = await invoke<VersionInfo>("check_versions");
      console.log("Version info received:", versionInfo);

      this.updateVersionUI(versionInfo);
    } catch (error) {
      console.error("Error checking versions:", error);
      this.appVersionElement.textContent = "App v1.0.2-Alpha";
      this.spicetifyVersionElement.textContent = "Version check failed";
      this.footerVersionElement.textContent = "v1.0.2-Alpha";
    }
  }

  // Update the updateVersionUI method to add "-Alpha" suffix to version numbers
  private updateVersionUI(versionInfo: VersionInfo): void {
    const appVersion = versionInfo.installerVersion || "1.0.2-Alpha";
    // Add "-Alpha" suffix if it's not already there
    const formattedAppVersion = appVersion.includes("-Alpha")
      ? appVersion
      : `${appVersion}-Alpha`;

    this.appVersionElement.textContent = `App v${formattedAppVersion}`;
    this.appVersionElement.classList.add("app-version-badge");
    this.footerVersionElement.textContent = `v${formattedAppVersion}`;

    // Show latest version in title if available
    if (versionInfo.latestInstallerVersion) {
      // Format latest version with "-Alpha" suffix if needed
      const formattedLatestVersion =
        versionInfo.latestInstallerVersion.includes("-Alpha")
          ? versionInfo.latestInstallerVersion
          : `${versionInfo.latestInstallerVersion}-Alpha`;

      // Check if current version is higher than latest version
      const isHigherThanLatest = this.isVersionHigherThanLatest(
        formattedAppVersion,
        formattedLatestVersion
      );

      if (isHigherThanLatest) {
        // Handle case where local version is higher than latest (possibly unreleased/dev version)
        this.appVersionElement.title = `Warning: Your version (v${formattedAppVersion}) is higher than the latest release (v${formattedLatestVersion})`;
        this.appVersionElement.classList.remove(
          "success-text",
          "warning-text",
          "updatable"
        );
        this.appVersionElement.classList.add("error-text", "version-badge");
      } else if (versionInfo.hasInstallerUpdate) {
        // Normal update case
        this.appVersionElement.title = `Latest version: v${formattedLatestVersion}`;
        this.appVersionElement.classList.remove("success-text", "error-text");
        this.appVersionElement.classList.add(
          "warning-text",
          "version-badge",
          "updatable"
        );
      } else {
        // Up to date case
        this.appVersionElement.title = `You have the latest version`;
        this.appVersionElement.classList.remove(
          "warning-text",
          "updatable",
          "error-text"
        );
        this.appVersionElement.classList.add("success-text", "version-badge");
      }
    }

    if (versionInfo.spicetifyVersion) {
      const verMatch = versionInfo.spicetifyVersion.match(/\d+\.\d+\.\d+/);
      const cleanVersion = verMatch ? verMatch[0] : "Unknown version";

      this.spicetifyVersionElement.classList.remove(
        "success-text",
        "warning-text",
        "error-text"
      );

      if (versionInfo.hasSpicetifyUpdate) {
        this.spicetifyVersionElement.textContent = `Spicetify v${cleanVersion}`;
        this.spicetifyVersionElement.classList.add(
          "warning-text",
          "version-badge",
          "updatable"
        );
        this.spicetifyVersionElement.style.cursor = "pointer";
        this.spicetifyVersionElement.title =
          "Click to update to the latest version";
      } else {
        this.spicetifyVersionElement.textContent = `Spicetify v${cleanVersion}`;
        this.spicetifyVersionElement.classList.add(
          "success-text",
          "version-badge"
        );
        this.spicetifyVersionElement.style.cursor = "default";
        this.spicetifyVersionElement.title = "";
      }
    } else {
      this.spicetifyVersionElement.textContent = "Spicetify not installed";
      this.spicetifyVersionElement.classList.add("error-text", "version-badge");
      this.spicetifyVersionElement.classList.remove(
        "warning-text",
        "success-text",
        "updatable"
      );
      this.spicetifyVersionElement.style.cursor = "default";
      this.spicetifyVersionElement.title = "";
    }

    // Format latest version with "-Alpha" suffix if needed
    const formattedLatestVersion =
      versionInfo.latestInstallerVersion &&
      (versionInfo.latestInstallerVersion.includes("-Alpha")
        ? versionInfo.latestInstallerVersion
        : `${versionInfo.latestInstallerVersion}-Alpha`);

    // Check if current version is higher than latest version
    const isHigherThanLatest =
      versionInfo.latestInstallerVersion &&
      this.isVersionHigherThanLatest(
        formattedAppVersion,
        formattedLatestVersion!
      );

    if (isHigherThanLatest) {
      // Show warning for higher-than-latest version
      this.updateNotificationElement.classList.remove("hidden");
      this.updateNotificationElement.classList.add(
        "update-notification-badge",
        "error-notification"
      );
      this.updateNotificationElement.textContent =
        "Warning: Unreleased Version";
    } else if (
      versionInfo.hasInstallerUpdate ||
      versionInfo.hasSpicetifyUpdate
    ) {
      // Normal update notification
      this.updateNotificationElement.classList.remove(
        "hidden",
        "error-notification"
      );
      this.updateNotificationElement.classList.add("update-notification-badge");

      if (versionInfo.hasInstallerUpdate && versionInfo.hasSpicetifyUpdate) {
        this.updateNotificationElement.textContent =
          "Installer & Spicetify Updates Available!";
      } else if (versionInfo.hasInstallerUpdate) {
        this.updateNotificationElement.textContent = `Update Available: v${formattedLatestVersion}`;
      } else {
        this.updateNotificationElement.textContent =
          "Spicetify Update Available!";
      }
    } else {
      this.updateNotificationElement.classList.add("hidden");
    }
  }

  // Add a helper method to compare versions
  private isVersionHigherThanLatest(
    currentVersion: string,
    latestVersion: string
  ): boolean {
    // Remove 'v' prefix if present
    const current = currentVersion.replace(/^v/, "");
    const latest = latestVersion.replace(/^v/, "");

    // Extract numeric parts for comparison
    const currentParts = current.split(/[.-]/).map((part) => {
      const num = Number.parseInt(part.replace(/[^\d]/g, ""));
      return isNaN(num) ? 0 : num;
    });

    const latestParts = latest.split(/[.-]/).map((part) => {
      const num = Number.parseInt(part.replace(/[^\d]/g, ""));
      return isNaN(num) ? 0 : num;
    });

    // Compare each part
    for (
      let i = 0;
      i < Math.max(currentParts.length, latestParts.length);
      i++
    ) {
      const currentPart = currentParts[i] || 0;
      const latestPart = latestParts[i] || 0;

      if (currentPart > latestPart) {
        return true;
      } else if (currentPart < latestPart) {
        return false;
      }
    }

    // If we get here, versions are equal
    return false;
  }

  // Update the handleUpdateClick method to handle the higher-than-latest case
  private async handleUpdateClick(): Promise<void> {
    try {
      const versionInfo = await invoke<VersionInfo>("check_versions");

      // Format versions with "-Alpha" suffix if needed
      const formattedAppVersion = versionInfo.installerVersion.includes(
        "-Alpha"
      )
        ? versionInfo.installerVersion
        : `${versionInfo.installerVersion}-Alpha`;

      const formattedLatestVersion =
        versionInfo.latestInstallerVersion &&
        (versionInfo.latestInstallerVersion.includes("-Alpha")
          ? versionInfo.latestInstallerVersion
          : `${versionInfo.latestInstallerVersion}-Alpha`);

      // Check if current version is higher than latest
      const isHigherThanLatest =
        versionInfo.latestInstallerVersion &&
        this.isVersionHigherThanLatest(
          formattedAppVersion,
          formattedLatestVersion!
        );

      if (isHigherThanLatest) {
        this.showVersionWarningModal(
          formattedAppVersion,
          formattedLatestVersion || ""
        );
      } else if (versionInfo.hasInstallerUpdate) {
        this.showUpdateModal(
          "installer",
          versionInfo.latestInstallerVersion || "1.0.2"
        );
      } else if (versionInfo.hasSpicetifyUpdate) {
        this.showUpdateModal("spicetify", "");
      }
    } catch (error) {
      console.error("Error handling update:", error);
      this.appendOutput(`Error checking for updates: ${error}\n`);
    }
  }

  // Add a new method to show the version warning modal
  private showVersionWarningModal(
    currentVersion: string,
    latestVersion: string
  ): void {
    if (!this.updateModal) {
      this.createUpdateModal();
    }

    const title = document.getElementById("update-modal-title")!;
    const message = document.getElementById("update-modal-message")!;
    const downloadBtn = document.getElementById("update-download-btn")!;

    title.textContent = "Warning: Unreleased Version";
    title.style.color = "#e22134"; // Error color

    message.innerHTML = `
    <div class="update-info-container">
      <div class="update-icon warning-icon">
        <span class="material-icons">warning</span>
      </div>
      <div class="update-details">
        <p class="update-intro error-text">You are using an unreleased or development version!</p>
        <div class="version-comparison warning-comparison">
          <div class="current-version">
            <span class="version-label">Your version:</span>
            <span class="version-value error-value">v${currentVersion}</span>
          </div>
          <div class="version-arrow">
            <span class="material-icons">arrow_downward</span>
          </div>
          <div class="latest-version">
            <span class="version-label">Latest stable release:</span>
            <span class="version-value">v${latestVersion}</span>
          </div>
        </div>
        <p class="update-benefits warning-text">
          Your version appears to be newer than the latest official release. This could be a development build or an unreleased version. Consider installing the latest stable release for better compatibility and support.
        </p>
      </div>
    </div>
  `;

    downloadBtn.innerHTML = `
    <span class="material-icons">get_app</span>
    Install Latest Stable Release
  `;

    this.updateModal!.classList.remove("hidden");
    setTimeout(() => {
      this.updateModal!.classList.add("visible");
    }, 10);
  }

  private async handleSpicetifyVersionClick(): Promise<void> {
    try {
      const versionInfo = await invoke<VersionInfo>("check_versions");

      if (versionInfo.hasSpicetifyUpdate) {
        this.showUpdateModal("spicetify", "");
      }
    } catch (error) {
      console.error("Error handling Spicetify version click:", error);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new SpicetifyInstallerApp();
});
