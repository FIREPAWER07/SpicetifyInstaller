import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { DropdownHandler } from "./dropdown-handler"

interface SpicetifyCommand {
  name: string
  command: string
  description: string
}

interface VersionInfo {
  installerVersion: string
  spicetifyVersion: string | null
  hasInstallerUpdate: boolean
  hasSpicetifyUpdate: boolean
  latestInstallerVersion: string | null
  latestInstallerUrl: string | null
}

class LoadingManager {
  private loadingScreen: HTMLElement
  private mainApp: HTMLElement
  private loadingText: HTMLElement
  private steps: NodeListOf<HTMLElement>
  private currentStep = 0

  constructor() {
    this.loadingScreen = document.getElementById("loading-screen")!
    this.mainApp = document.getElementById("main-app")!
    this.loadingText = document.getElementById("loading-text")!
    this.steps = document.querySelectorAll(".loading-step")
  }

  updateLoadingText(text: string): void {
    this.loadingText.textContent = text
  }

  completeStep(stepIndex: number): void {
    if (stepIndex < this.steps.length) {
      const step = this.steps[stepIndex]
      step.classList.remove("active")
      step.classList.add("completed")

      const statusIcon = step.querySelector(".step-status")!
      statusIcon.textContent = "check_circle"
    }
  }

  activateStep(stepIndex: number): void {
    // Deactivate previous step
    if (this.currentStep < this.steps.length) {
      this.steps[this.currentStep].classList.remove("active")
    }

    // Activate current step
    if (stepIndex < this.steps.length) {
      const step = this.steps[stepIndex]
      step.classList.add("active")

      const statusIcon = step.querySelector(".step-status")!
      statusIcon.textContent = "hourglass_empty"
    }

    this.currentStep = stepIndex
  }

  async hideLoadingScreen(): Promise<void> {
    return new Promise((resolve) => {
      this.loadingScreen.classList.add("fade-out")
      this.mainApp.classList.remove("hidden")

      setTimeout(() => {
        this.loadingScreen.style.display = "none"
        resolve()
      }, 800)
    })
  }
}

class SpicetifyInstallerApp {
  private dom = {
    commandDisplay: document.getElementById("command-display")!,
    executeButton: document.getElementById("execute-button") as HTMLButtonElement,
    outputElement: document.getElementById("output")!,
    outputCard: document.getElementById("output-card")!,
    clearOutputButton: document.getElementById("clear-output")!,
    progressBar: document.getElementById("progress-bar")!,
    progressPercentage: document.getElementById("progress-percentage")!,
    faqButton: document.getElementById("open-faq")!,
    faqModal: document.getElementById("faq-modal")!,
    closeFaqButton: document.getElementById("close-faq")!,
    appVersionElement: document.getElementById("app-version")!,
    spicetifyVersionElement: document.getElementById("spicetify-version")!,
    updateNotificationElement: document.getElementById("update-notification")!,
    footerVersionElement: document.getElementById("footer-version")!,
  }

  private dropdownHandler: DropdownHandler
  private updateModal: HTMLElement | null = null
  private selectedCommand: string | null = null
  private isExecuting = false
  private currentProgress = 0
  private progressInterval: number | null = null
  private progressListener: any = null
  private versionComparisonCache = new Map<string, boolean>()
  private updateClickTimeout: number | null = null
  private outputBuffer = ""
  private outputUpdateScheduled = false
  private loadingManager: LoadingManager

  private static readonly COMMANDS: SpicetifyCommand[] = [
    {
      name: "INSTALL",
      command: "iwr -useb https://raw.githubusercontent.com/spicetify/spicetify-cli/master/install.ps1 | iex",
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
      description: "Completely removes Spicetify and restores Spotify to its original state",
    },
  ]

  constructor() {
    this.loadingManager = new LoadingManager()

    // Initialize version display elements with loading text
    this.dom.appVersionElement.textContent = "Loading app version..."
    this.dom.spicetifyVersionElement.textContent = "Checking Spicetify version..."
    this.dom.footerVersionElement.textContent = "Loading..."

    this.dropdownHandler = new DropdownHandler((optionName, command) => {
      this.selectOption(optionName, command)
    })

    this.initEventListeners()
    this.createUpdateModal()

    // Start the loading sequence
    this.startLoadingSequence()
  }

  private async startLoadingSequence(): Promise<void> {
    try {
      // Step 1: Loading application
      this.loadingManager.activateStep(0)
      this.loadingManager.updateLoadingText("Loading application components...")

      // Simulate app initialization
      await this.delay(1000)
      this.loadingManager.completeStep(0)

      // Step 2: Checking versions
      this.loadingManager.activateStep(1)
      this.loadingManager.updateLoadingText("Checking application and Spicetify versions...")

      await this.checkVersions()
      this.loadingManager.completeStep(1)

      // Step 3: Verifying installation
      this.loadingManager.activateStep(2)
      this.loadingManager.updateLoadingText("Verifying Spicetify installation...")

      await this.runInitialDiagnostic()
      this.loadingManager.completeStep(2)

      // Final step
      this.loadingManager.updateLoadingText("Initialization complete!")
      await this.delay(500)

      // Hide loading screen and show main app
      await this.loadingManager.hideLoadingScreen()
    } catch (error) {
      console.error("Loading sequence error:", error)
      this.loadingManager.updateLoadingText("Error during initialization. Continuing...")
      await this.delay(1000)
      await this.loadingManager.hideLoadingScreen()
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private createUpdateModal(): void {
    if (!document.getElementById("update-modal")) {
      const modal = document.createElement("div")
      modal.id = "update-modal"
      modal.className = "modal hidden"

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
      </div>`

      document.body.appendChild(modal)

      modal.addEventListener("click", (event) => {
        const target = event.target as HTMLElement
        if (target.closest("#close-update-modal, #update-cancel-btn")) {
          this.closeUpdateModal()
        } else if (target.closest("#update-download-btn")) {
          this.downloadUpdate()
        } else if (target === modal) {
          this.closeUpdateModal()
        }
      })

      this.updateModal = modal
    } else {
      this.updateModal = document.getElementById("update-modal")
    }
  }

  private showUpdateModal(type: "installer" | "spicetify", version: string): void {
    document.body.classList.add("modal-open")
    if (!this.updateModal) {
      this.createUpdateModal()
    }

    const title = document.getElementById("update-modal-title")!
    const message = document.getElementById("update-modal-message")!

    if (type === "installer") {
      title.textContent = "Installer Update Available"
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
              <span class="version-value">${this.dom.appVersionElement.textContent?.replace("App ", "")}</span>
            </div>
            <div class="version-arrow">
              <span class="material-icons">arrow_forward</span>
            </div>
            <div class="latest-version">
              <span class="version-label">Latest version:</span>
              <span class="version-value">v${version}</span>
            </div>
          </div>
          <p class="update-benefits">
            This update includes bug fixes, performance improvements, and new features.
          </p>
        </div>
      </div>`
    } else {
      title.textContent = "Spicetify Update Available"
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
      </div>`
    }

    this.updateModal!.classList.remove("hidden")
    requestAnimationFrame(() => {
      this.updateModal!.classList.add("visible")
    })
  }

  private closeUpdateModal(): void {
    document.body.classList.remove("modal-open")
    if (this.updateModal) {
      this.updateModal.classList.remove("visible")
      setTimeout(() => {
        this.updateModal!.classList.add("hidden")
      }, 300)
    }
  }

  private async downloadUpdate(): Promise<void> {
    this.closeUpdateModal()

    try {
      const versionInfo = await invoke<VersionInfo>("check_versions")

      if (versionInfo.hasInstallerUpdate) {
        this.dom.outputCard.classList.remove("hidden")
        requestAnimationFrame(() => {
          this.dom.outputCard.classList.add("visible")
        })

        this.updateProgressBar(0)
        this.appendOutput("Starting automatic update download...\n")

        try {
          await invoke("download_update")
          this.appendOutput("Update download started. The application will restart automatically.\n")
          this.updateProgressBar(100)
        } catch (error) {
          this.appendOutput(`Failed to download update automatically: ${error}\n`)
          this.appendOutput("Opening manual download page...\n")
          await invoke("open_download_url")
        }
      } else if (versionInfo.hasSpicetifyUpdate) {
        this.selectOption("INSTALL", SpicetifyInstallerApp.COMMANDS[0].command)
        await this.executeCommand()
      }
    } catch (error) {
      console.error("Error handling update:", error)
      this.appendOutput(`Error handling update: ${error}\n`)
    }
  }

  private initEventListeners(): void {
    this.dom.executeButton.addEventListener("click", () => {
      if (!this.isExecuting) {
        this.executeCommand()
      }
    })

    this.dom.clearOutputButton.addEventListener("click", () => {
      this.clearOutput()
    })

    this.dom.faqButton.addEventListener("click", () => {
      this.openFaqUrl()
    })

    this.dom.closeFaqButton.addEventListener("click", () => {
      this.closeFaqModal()
    })

    this.dom.faqModal.addEventListener("click", (event) => {
      if (event.target === this.dom.faqModal) {
        this.closeFaqModal()
      }
    })

    this.dom.updateNotificationElement.addEventListener(
      "click",
      this.throttle(() => {
        this.handleUpdateClick()
      }, 500),
    )

    this.dom.spicetifyVersionElement.addEventListener(
      "click",
      this.throttle(() => {
        this.handleSpicetifyVersionClick()
      }, 500),
    )
  }

  private throttle(fn: Function, delay: number): (...args: any[]) => void {
    let lastCall = 0
    return (...args: any[]) => {
      const now = Date.now()
      if (now - lastCall >= delay) {
        lastCall = now
        fn(...args)
      }
    }
  }

  private async runInitialDiagnostic(): Promise<void> {
    try {
      const locationInfo = await invoke<string>("check_spicetify_location")
      console.log("Spicetify location info:", locationInfo)

      try {
        const output = await invoke<string>("execute_powershell_command", {
          command: "try { spicetify -v } catch { Write-Output 'Command failed' }",
        })
        console.log("Spicetify version command output:", output)
      } catch (error) {
        console.log("Failed to run spicetify command:", error)
      }
    } catch (error) {
      console.error("Diagnosis error:", error)
    }
  }

  private selectOption(optionName: string, command: string): void {
    this.selectedCommand = command
    this.dom.commandDisplay.textContent = `> ${command}`
    this.dom.executeButton.disabled = false
  }

  private async executeCommand(): Promise<void> {
    if (!this.selectedCommand || this.isExecuting) return

    this.isExecuting = true

    this.dom.outputCard.classList.remove("hidden")
    requestAnimationFrame(() => {
      this.dom.outputCard.classList.add("visible")
    })

    this.currentProgress = 0
    this.updateProgressBar(0)

    this.dom.executeButton.disabled = true
    this.dom.executeButton.classList.add("executing")
    const originalButtonText = this.dom.executeButton.innerHTML
    this.dom.executeButton.innerHTML = `
      <div class="loading"></div>
      <span>Executing...</span>
      <div class="button-progress-bar" id="progress-bar"></div>
      <div class="button-progress-percentage" id="progress-percentage">0%</div>
    `

    this.dom.progressBar = document.getElementById("progress-bar")!
    this.dom.progressPercentage = document.getElementById("progress-percentage")!

    this.dom.outputElement.textContent = ""
    this.appendOutput(`> ${this.selectedCommand}\n\n`)

    try {
      this.setupProgressListener()

      if (this.selectedCommand.includes("restore backup apply")) {
        await this.executeFixedRepairCommand()
      } else {
        await this.executeCommandWithTauri(this.selectedCommand)
      }

      this.completeProgress()
      this.appendOutput("\n<span class='success-text'>[SUCCESS] Command executed successfully!</span>\n")

      await this.checkVersions()
    } catch (error) {
      this.completeProgress()
      this.appendOutput(`\n<span class='error-text'>[ERROR] ${error}</span>\n`)
    } finally {
      this.dom.executeButton.innerHTML = originalButtonText
      this.dom.executeButton.disabled = false
      this.dom.executeButton.classList.remove("executing")
      this.isExecuting = false
      this.removeProgressListener()
    }
  }

  private async executeFixedRepairCommand(): Promise<void> {
    try {
      this.appendOutput("Step 1: Restoring from backup...\n")
      await this.executeCommandWithTauri("spicetify restore")

      this.appendOutput("\nStep 2: Creating a new backup...\n")
      await this.executeCommandWithTauri("spicetify backup")

      this.appendOutput("\nStep 3: Applying Spicetify customizations...\n")
      await this.executeCommandWithTauri("spicetify apply")
    } catch (error) {
      throw new Error(`Repair process failed: ${error}`)
    }
  }

  private async setupProgressListener(): Promise<void> {
    this.progressListener = await listen("progress_update", (event: any) => {
      const progress = event.payload as number
      this.updateProgressBar(progress)
    })
  }

  private removeProgressListener(): void {
    if (this.progressListener) {
      this.progressListener()
      this.progressListener = null
    }
  }

  private async executeCommandWithTauri(command: string): Promise<void> {
    try {
      const output = await invoke<string>("execute_powershell_command", {
        command,
      })
      this.appendOutput(`[PowerShell Output]\n${output}\n`)
    } catch (error) {
      throw new Error(`${error}`)
    }
  }

  private completeProgress(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval)
      this.progressInterval = null
    }
    this.updateProgressBar(100)
  }

  private updateProgressBar(percentage: number): void {
    if (this.dom.progressBar) {
      this.dom.progressBar.style.width = `${percentage}%`
    }
    if (this.dom.progressPercentage) {
      this.dom.progressPercentage.textContent = `${Math.round(percentage)}%`
    }
  }

  private appendOutput(text: string): void {
    this.outputBuffer += text

    if (!this.outputUpdateScheduled) {
      this.outputUpdateScheduled = true
      requestAnimationFrame(() => {
        const fragment = document.createDocumentFragment()
        const temp = document.createElement("div")
        temp.innerHTML = this.outputBuffer

        while (temp.firstChild) {
          fragment.appendChild(temp.firstChild)
        }

        this.dom.outputElement.appendChild(fragment)
        this.dom.outputElement.scrollTop = this.dom.outputElement.scrollHeight

        this.outputBuffer = ""
        this.outputUpdateScheduled = false
      })
    }
  }

  private clearOutput(): void {
    this.dom.outputElement.textContent = ""
    this.outputBuffer = ""
  }

  private async openFaqUrl(): Promise<void> {
    try {
      await invoke("open_faq_url")
    } catch (error) {
      console.error("Error opening FAQ URL:", error)
      this.openFaqModal()
    }
  }

  private openFaqModal(): void {
    this.dom.faqModal.classList.remove("hidden")
    requestAnimationFrame(() => {
      this.dom.faqModal.classList.add("visible")
    })
  }

  private closeFaqModal(): void {
    this.dom.faqModal.classList.remove("visible")
    setTimeout(() => {
      this.dom.faqModal.classList.add("hidden")
    }, 300)
  }

  private async checkVersions(): Promise<void> {
    try {
      const versionInfo = await invoke<VersionInfo>("check_versions")
      this.updateVersionUI(versionInfo)
    } catch (error) {
      console.error("Error checking versions:", error)
      this.dom.appVersionElement.textContent = "App v1.0.2-Alpha"
      this.dom.spicetifyVersionElement.textContent = "Version check failed"
      this.dom.footerVersionElement.textContent = "v1.0.2-Alpha"
    }
  }

  private isVersionHigherThanLatest(currentVersion: string, latestVersion: string): boolean {
    const cacheKey = `${currentVersion}:${latestVersion}`
    if (this.versionComparisonCache.has(cacheKey)) {
      return this.versionComparisonCache.get(cacheKey)!
    }

    const current = currentVersion.replace(/^v/, "")
    const latest = latestVersion.replace(/^v/, "")

    const currentParts = current.split(/[.-]/).map((part) => {
      const num = Number.parseInt(part.replace(/[^\d]/g, ""))
      return isNaN(num) ? 0 : num
    })

    const latestParts = latest.split(/[.-]/).map((part) => {
      const num = Number.parseInt(part.replace(/[^\d]/g, ""))
      return isNaN(num) ? 0 : num
    })

    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const currentPart = currentParts[i] || 0
      const latestPart = latestParts[i] || 0

      if (currentPart > latestPart) {
        this.versionComparisonCache.set(cacheKey, true)
        return true
      } else if (currentPart < latestPart) {
        this.versionComparisonCache.set(cacheKey, false)
        return false
      }
    }

    this.versionComparisonCache.set(cacheKey, false)
    return false
  }

  private updateVersionUI(versionInfo: VersionInfo): void {
    const appVersion = versionInfo.installerVersion || "1.0.2-Alpha"
    this.dom.appVersionElement.textContent = `App v${appVersion}`
    this.dom.appVersionElement.classList.add("app-version-badge")
    this.dom.footerVersionElement.textContent = `v${appVersion}`

    if (versionInfo.latestInstallerVersion) {
      const isHigherThanLatest = this.isVersionHigherThanLatest(appVersion, versionInfo.latestInstallerVersion)

      this.dom.appVersionElement.classList.toggle("error-text", isHigherThanLatest)
      this.dom.appVersionElement.classList.toggle("version-badge", true)
      this.dom.appVersionElement.classList.toggle("warning-text", versionInfo.hasInstallerUpdate && !isHigherThanLatest)
      this.dom.appVersionElement.classList.toggle("updatable", versionInfo.hasInstallerUpdate && !isHigherThanLatest)
      this.dom.appVersionElement.classList.toggle(
        "success-text",
        !versionInfo.hasInstallerUpdate && !isHigherThanLatest,
      )

      if (isHigherThanLatest) {
        this.dom.appVersionElement.title = `Warning: Your version (v${appVersion}) is higher than the latest release (v${versionInfo.latestInstallerVersion})`
      } else if (versionInfo.hasInstallerUpdate) {
        this.dom.appVersionElement.title = `Latest version: v${versionInfo.latestInstallerVersion}`
      } else {
        this.dom.appVersionElement.title = `You have the latest version`
      }
    }

    if (versionInfo.spicetifyVersion) {
      const verMatch = versionInfo.spicetifyVersion.match(/\d+\.\d+\.\d+/)
      const cleanVersion = verMatch ? verMatch[0] : "Unknown version"

      this.dom.spicetifyVersionElement.className = ""
      this.dom.spicetifyVersionElement.textContent = `Spicetify v${cleanVersion}`

      if (versionInfo.hasSpicetifyUpdate) {
        this.dom.spicetifyVersionElement.classList.add("warning-text", "version-badge", "updatable")
        this.dom.spicetifyVersionElement.style.cursor = "pointer"
        this.dom.spicetifyVersionElement.title = "Click to update to the latest version"
      } else {
        this.dom.spicetifyVersionElement.classList.add("success-text", "version-badge")
        this.dom.spicetifyVersionElement.style.cursor = "default"
        this.dom.spicetifyVersionElement.title = ""
      }
    } else {
      this.dom.spicetifyVersionElement.className = ""
      this.dom.spicetifyVersionElement.textContent = "Spicetify not installed"
      this.dom.spicetifyVersionElement.classList.add("error-text", "version-badge")
      this.dom.spicetifyVersionElement.style.cursor = "default"
      this.dom.spicetifyVersionElement.title = ""
    }

    const isHigherThanLatest =
      versionInfo.latestInstallerVersion &&
      this.isVersionHigherThanLatest(appVersion, versionInfo.latestInstallerVersion)

    const hasUpdates = versionInfo.hasInstallerUpdate || versionInfo.hasSpicetifyUpdate
    this.dom.updateNotificationElement.classList.toggle("hidden", !hasUpdates && !isHigherThanLatest)
    this.dom.updateNotificationElement.className = this.dom.updateNotificationElement.className.replace(
      /(?:^|\s)update-notification-badge(?!\S)/g,
      "",
    )

    if (isHigherThanLatest || hasUpdates) {
      this.dom.updateNotificationElement.classList.add("update-notification-badge")

      if (isHigherThanLatest) {
        this.dom.updateNotificationElement.textContent = "Warning: Unreleased Version"
      } else if (versionInfo.hasInstallerUpdate && versionInfo.hasSpicetifyUpdate) {
        this.dom.updateNotificationElement.textContent = "Installer & Spicetify Updates Available!"
      } else if (versionInfo.hasInstallerUpdate) {
        this.dom.updateNotificationElement.textContent = `Update Available: v${versionInfo.latestInstallerVersion}`
      } else {
        this.dom.updateNotificationElement.textContent = "Spicetify Update Available!"
      }
    }
  }

  private async handleUpdateClick(): Promise<void> {
    try {
      const versionInfo = await invoke<VersionInfo>("check_versions")

      const isHigherThanLatest =
        versionInfo.latestInstallerVersion &&
        this.isVersionHigherThanLatest(versionInfo.installerVersion, versionInfo.latestInstallerVersion)

      if (isHigherThanLatest) {
        this.showVersionWarningModal(versionInfo.installerVersion, versionInfo.latestInstallerVersion || "")
      } else if (versionInfo.hasInstallerUpdate) {
        this.showUpdateModal("installer", versionInfo.latestInstallerVersion || "v1.0.2-Alpha")
      } else if (versionInfo.hasSpicetifyUpdate) {
        this.showUpdateModal("spicetify", "")
      }
    } catch (error) {
      console.error("Error handling update:", error)
      this.appendOutput(`Error checking for updates: ${error}\n`)
    }
  }

  private showVersionWarningModal(currentVersion: string, latestVersion: string): void {
    document.body.classList.add("modal-open")
    if (!this.updateModal) {
      this.createUpdateModal()
    }

    const title = document.getElementById("update-modal-title")!
    const message = document.getElementById("update-modal-message")!
    const downloadBtn = document.getElementById("update-download-btn")!

    title.textContent = "Warning: Unreleased Version"
    title.style.color = "#e22134"

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
    </div>`

    downloadBtn.innerHTML = `
    <span class="material-icons">get_app</span>
    Install Latest Stable Release`

    this.updateModal!.classList.remove("hidden")
    requestAnimationFrame(() => {
      this.updateModal!.classList.add("visible")
    })
  }

  private async handleSpicetifyVersionClick(): Promise<void> {
    try {
      const versionInfo = await invoke<VersionInfo>("check_versions")

      if (versionInfo.hasSpicetifyUpdate) {
        this.showUpdateModal("spicetify", "")
      }
    } catch (error) {
      console.error("Error handling Spicetify version click:", error)
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => new SpicetifyInstallerApp())
} else {
  new SpicetifyInstallerApp()
}
