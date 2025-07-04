import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { DropdownHandler } from "./dropdown-handler"
import { UpdateManager, type UpdateInfo, type UpdateProgress } from "./update-manager"

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
    if (this.currentStep < this.steps.length) {
      this.steps[this.currentStep].classList.remove("active")
    }

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
  private updateManager: UpdateManager
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

    this.dom.appVersionElement.textContent = "Loading app version..."
    this.dom.spicetifyVersionElement.textContent = "Checking Spicetify version..."
    this.dom.footerVersionElement.textContent = "Loading..."

    this.updateManager = new UpdateManager()
    this.updateManager.setProgressCallback((progress) => {
      this.handleUpdateProgress(progress)
    })

    this.dropdownHandler = new DropdownHandler((optionName, command) => {
      this.selectOption(optionName, command)
    })

    this.initEventListeners()

    this.startLoadingSequence()
  }

  private async startLoadingSequence(): Promise<void> {
    try {
      this.loadingManager.activateStep(0)
      this.loadingManager.updateLoadingText("Loading application components...")

      await this.delay(1000)
      this.loadingManager.completeStep(0)

      this.loadingManager.activateStep(1)
      this.loadingManager.updateLoadingText("Checking application and Spicetify versions...")

      await this.checkVersions()
      this.loadingManager.completeStep(1)

      this.loadingManager.activateStep(2)
      this.loadingManager.updateLoadingText("Verifying Spicetify installation...")

      await this.runInitialDiagnostic()
      this.loadingManager.completeStep(2)

      await this.checkForAppUpdates()

      this.loadingManager.updateLoadingText("Initialization complete!")
      await this.delay(500)

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

  private async checkForAppUpdates(): Promise<void> {
    try {
      const updateInfo = await this.updateManager.checkForUpdates()
      if (updateInfo && updateInfo.updateAvailable) {
        this.showUpdateNotification(updateInfo)
      }
    } catch (error) {
      console.error("Failed to check for app updates:", error)
    }
  }

  private showUpdateNotification(updateInfo: UpdateInfo): void {
    const updateNotification = this.dom.updateNotificationElement
    updateNotification.textContent = `App Update Available: v${updateInfo.latestVersion}`
    updateNotification.classList.remove("hidden")
    updateNotification.classList.add("update-notification-badge")

    // Remove any existing click handlers
    const newNotification = updateNotification.cloneNode(true) as HTMLElement
    updateNotification.parentNode?.replaceChild(newNotification, updateNotification)
    this.dom.updateNotificationElement = newNotification

    newNotification.onclick = async () => {
      console.log("Update notification clicked")
      try {
        const success = await this.updateManager.showUpdateDialog(updateInfo)
        console.log("Update dialog result:", success)
      } catch (error) {
        console.error("Error showing update dialog:", error)
      }
    }
  }

  private handleUpdateProgress(progress: UpdateProgress): void {
    if (this.dom.outputCard.classList.contains("visible")) {
      this.appendOutput(`[UPDATE] ${progress.stage}: ${progress.message} (${progress.progress}%)\n`)
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
      console.log("Update click handler called")
      const versionInfo = await invoke<VersionInfo>("check_versions")
      console.log("Version info:", versionInfo)

      if (versionInfo.hasInstallerUpdate && versionInfo.latestInstallerUrl) {
        const updateInfo: UpdateInfo = {
          currentVersion: versionInfo.installerVersion,
          latestVersion: versionInfo.latestInstallerVersion || "unknown",
          downloadUrl: versionInfo.latestInstallerUrl,
          updateAvailable: true,
        }

        console.log("Showing update dialog with info:", updateInfo)
        await this.updateManager.showUpdateDialog(updateInfo)
      } else if (versionInfo.hasSpicetifyUpdate) {
        // Handle Spicetify update by running install command
        this.selectOption("INSTALL", SpicetifyInstallerApp.COMMANDS[0].command)
        await this.executeCommand()
      }
    } catch (error) {
      console.error("Error handling update:", error)
      this.appendOutput(`Error checking for updates: ${error}\n`)
    }
  }

  private async handleSpicetifyVersionClick(): Promise<void> {
    try {
      const versionInfo = await invoke<VersionInfo>("check_versions")

      if (versionInfo.hasSpicetifyUpdate) {
        this.selectOption("INSTALL", SpicetifyInstallerApp.COMMANDS[0].command)
        await this.executeCommand()
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
