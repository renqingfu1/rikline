import { UnsavedChangesDialog } from "@/components/common/AlertDialog"
import HeroTooltip from "@/components/common/HeroTooltip"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { StateServiceClient } from "@/services/grpc-client"
import { validateApiConfiguration, validateModelId } from "@/utils/validate"
import { vscode } from "@/utils/vscode"
import { ExtensionMessage } from "@shared/ExtensionMessage"
import { EmptyRequest, StringRequest } from "@shared/proto/common"
import { PlanActMode, ResetStateRequest, TogglePlanActModeRequest, UpdateSettingsRequest } from "@shared/proto/state"
import { VSCodeButton, VSCodeCheckbox, VSCodeLink, VSCodeTextArea } from "@vscode/webview-ui-toolkit/react"
import {
	CheckCheck,
	FlaskConical,
	Info,
	LucideIcon,
	Settings,
	SquareMousePointer,
	SquareTerminal,
	Webhook,
	Shield,
} from "lucide-react"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { useEvent } from "react-use"
import { Tab, TabContent, TabHeader, TabList, TabTrigger } from "../common/Tab"
import { TabButton } from "../mcp/configuration/McpConfigurationView"
import ApiOptions from "./ApiOptions"
import BrowserSettingsSection from "./BrowserSettingsSection"
import FeatureSettingsSection from "./FeatureSettingsSection"
import PreferredLanguageSetting from "./PreferredLanguageSetting"
import Section from "./Section"
import SectionHeader from "./SectionHeader"
import TerminalSettingsSection from "./TerminalSettingsSection"
import ThirdPartyCodeReviewSettings from "./ThirdPartyCodeReviewSettings"
import { convertApiConfigurationToProtoApiConfiguration } from "@shared/proto-conversions/state/settings-conversion"
import { convertChatSettingsToProtoChatSettings } from "@shared/proto-conversions/state/chat-settings-conversion"
import { ThirdPartyCodeReviewServiceClient } from "@/services/grpc-client"
import {
	GetThirdPartyReviewGlobalConfigRequest,
	UpdateThirdPartyReviewGlobalConfigRequest,
	GlobalCodeReviewConfig,
	TestProviderConnectionRequest,
	ThirdPartyProviderConfig,
	RateLimits,
} from "@shared/proto/third_party_code_review"
const IS_DEV = process.env.IS_DEV

// Styles for the tab system
const settingsTabsContainer = "flex flex-1 overflow-hidden [&.narrow_.tab-label]:hidden"
const settingsTabList =
	"w-48 data-[compact=true]:w-12 flex-shrink-0 flex flex-col overflow-y-auto overflow-x-hidden border-r border-[var(--vscode-sideBar-background)]"
const settingsTabTrigger =
	"whitespace-nowrap overflow-hidden min-w-0 h-12 px-4 py-3 box-border flex items-center border-l-2 border-transparent text-[var(--vscode-foreground)] opacity-70 bg-transparent hover:bg-[var(--vscode-list-hoverBackground)] data-[compact=true]:w-12 data-[compact=true]:p-4 cursor-pointer"
const settingsTabTriggerActive =
	"opacity-100 border-l-2 border-l-[var(--vscode-focusBorder)] border-t-0 border-r-0 border-b-0 bg-[var(--vscode-list-activeSelectionBackground)]"

// Tab definitions
interface SettingsTab {
	id: string
	name: string
	tooltipText: string
	headerText: string
	icon: LucideIcon
}

export const SETTINGS_TABS: SettingsTab[] = [
	{
		id: "api-config",
		name: "API Configuration",
		tooltipText: "API Configuration",
		headerText: "API Configuration",
		icon: Webhook,
	},
	{
		id: "general",
		name: "General",
		tooltipText: "General Settings",
		headerText: "General Settings",
		icon: Settings,
	},
	{
		id: "features",
		name: "Features",
		tooltipText: "Feature Settings",
		headerText: "Feature Settings",
		icon: CheckCheck,
	},
	{
		id: "code-review",
		name: "Code Review",
		tooltipText: "第三方代码审查设置",
		headerText: "第三方代码审查",
		icon: Shield,
	},
	{
		id: "browser",
		name: "Browser",
		tooltipText: "Browser Settings",
		headerText: "Browser Settings",
		icon: SquareMousePointer,
	},
	{
		id: "terminal",
		name: "Terminal",
		tooltipText: "Terminal Settings",
		headerText: "Terminal Settings",
		icon: SquareTerminal,
	},
	// Only show in dev mode
	...(IS_DEV
		? [
				{
					id: "debug",
					name: "Debug",
					tooltipText: "Debug Tools",
					headerText: "Debug",
					icon: FlaskConical,
				},
			]
		: []),
	{
		id: "about",
		name: "About",
		tooltipText: "About Cline",
		headerText: "About",
		icon: Info,
	},
]

interface SettingsViewProps {
	onDone: () => void
	targetSection?: string
}

const SettingsView = ({ onDone, targetSection }: SettingsViewProps) => {
	// Track if there are unsaved changes
	const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
	// State for the unsaved changes dialog
	const [isUnsavedChangesDialogOpen, setIsUnsavedChangesDialogOpen] = useState(false)
	// Store the action to perform after confirmation
	const pendingAction = useRef<(() => void) | undefined>(undefined)
	// Track active tab
	const [activeTab, setActiveTab] = useState<string>(targetSection || "code-review")

	// 添加第三方代码审查配置状态
	const [configuredProviders, setConfiguredProviders] = useState<Record<string, ThirdPartyProviderConfig>>({})
	const [enabledProviders, setEnabledProviders] = useState<string[]>([])

	// 设置初始标签页
	useEffect(() => {
		if (targetSection) {
			console.log("设置目标标签页:", targetSection)
			setActiveTab(targetSection)
		}
	}, [targetSection])

	// 加载第三方代码审查配置
	useEffect(() => {
		const loadThirdPartyConfig = async () => {
			try {
				console.log("开始加载第三方代码审查配置...")
				const response = await ThirdPartyCodeReviewServiceClient.getThirdPartyReviewGlobalConfig(
					GetThirdPartyReviewGlobalConfigRequest.create({}),
				)

				console.log("获取到的配置响应:", response)

				if (response.config) {
					let configuredProvidersObj: Record<string, ThirdPartyProviderConfig> = {}

					if (response.config.configuredProviders) {
						try {
							console.log("原始配置字符串:", response.config.configuredProviders)
							const parsedConfig = JSON.parse(response.config.configuredProviders)
							console.log("解析后的配置:", parsedConfig)

							if (typeof parsedConfig === "object" && parsedConfig !== null) {
								// 确保每个提供商配置都是ThirdPartyProviderConfig实例
								Object.entries(parsedConfig).forEach(([key, value]) => {
									console.log(`处理提供商 ${key} 的配置:`, value)
									if (value && typeof value === "object") {
										const config = value as {
											apiKey?: string
											endpoint?: string
											timeout?: number
											retryAttempts?: number
											customHeaders?: Record<string, string>
											rateLimits?: {
												requestsPerMinute?: number
												requestsPerDay?: number
											}
										}

										configuredProvidersObj[key] = ThirdPartyProviderConfig.create({
											apiKey: String(config.apiKey || ""),
											endpoint: String(config.endpoint || ""),
											timeout: Number(config.timeout || 30),
											retryAttempts: Number(config.retryAttempts || 3),
											customHeaders: config.customHeaders || {},
											rateLimits: RateLimits.create({
												requestsPerMinute: Number(config.rateLimits?.requestsPerMinute || 60),
												requestsPerDay: Number(config.rateLimits?.requestsPerDay || 1000),
											}),
										})
										console.log(`创建的提供商配置:`, configuredProvidersObj[key])
									}
								})
							}
						} catch (error) {
							console.error("解析配置时出错:", error)
							console.log("原始配置字符串:", response.config.configuredProviders)
						}
					}

					console.log("最终的提供商配置:", configuredProvidersObj)
					console.log("启用的提供商:", response.config.enabledProviders)

					setConfiguredProviders(configuredProvidersObj)
					setEnabledProviders(response.config.enabledProviders || [])
				} else {
					console.log("没有找到配置，使用默认值")
					setConfiguredProviders({})
					setEnabledProviders([])
				}
			} catch (error) {
				console.error("加载第三方代码审查配置失败:", error)
				setConfiguredProviders({})
				setEnabledProviders([])
			}
		}

		loadThirdPartyConfig()
	}, [])

	const {
		apiConfiguration,
		version,
		openRouterModels,
		telemetrySetting,
		setTelemetrySetting,
		chatSettings,
		setChatSettings,
		planActSeparateModelsSetting,
		setPlanActSeparateModelsSetting,
		enableCheckpointsSetting,
		setEnableCheckpointsSetting,
		mcpMarketplaceEnabled,
		setMcpMarketplaceEnabled,
		mcpRichDisplayEnabled,
		setMcpRichDisplayEnabled,
		shellIntegrationTimeout,
		setShellIntegrationTimeout,
		terminalOutputLineLimit,
		setTerminalOutputLineLimit,
		terminalReuseEnabled,
		setTerminalReuseEnabled,
		defaultTerminalProfile,
		setDefaultTerminalProfile,
		mcpResponsesCollapsed,
		setMcpResponsesCollapsed,
		setApiConfiguration,
	} = useExtensionState()

	// Store the original state to detect changes
	const originalState = useRef({
		apiConfiguration,
		telemetrySetting,
		planActSeparateModelsSetting,
		enableCheckpointsSetting,
		mcpMarketplaceEnabled,
		mcpRichDisplayEnabled,
		mcpResponsesCollapsed,
		chatSettings,
		shellIntegrationTimeout,
		terminalReuseEnabled,
		terminalOutputLineLimit,
		defaultTerminalProfile,
	})
	const [apiErrorMessage, setApiErrorMessage] = useState<string | undefined>(undefined)
	const [modelIdErrorMessage, setModelIdErrorMessage] = useState<string | undefined>(undefined)
	const handleSubmit = async (withoutDone: boolean = false) => {
		const apiValidationResult = validateApiConfiguration(apiConfiguration)
		const modelIdValidationResult = validateModelId(apiConfiguration, openRouterModels)

		try {
			// 保存第三方代码审查配置
			await ThirdPartyCodeReviewServiceClient.updateThirdPartyReviewGlobalConfig(
				UpdateThirdPartyReviewGlobalConfigRequest.create({
					config: GlobalCodeReviewConfig.create({
						configuredProviders: JSON.stringify(configuredProviders),
						enabledProviders: enabledProviders,
					}),
				}),
			)

			// 保存其他设置
			if (!apiValidationResult && !modelIdValidationResult && apiConfiguration) {
				await StateServiceClient.updateSettings(
					UpdateSettingsRequest.create({
						apiConfiguration: convertApiConfigurationToProtoApiConfiguration(apiConfiguration),
						telemetrySetting,
						planActSeparateModelsSetting,
						enableCheckpointsSetting,
						mcpMarketplaceEnabled,
						mcpRichDisplayEnabled,
						mcpResponsesCollapsed,
						chatSettings: convertChatSettingsToProtoChatSettings(chatSettings),
						shellIntegrationTimeout,
						terminalReuseEnabled,
						terminalOutputLineLimit,
					}),
				)

				// Update default terminal profile if it has changed
				if (defaultTerminalProfile !== originalState.current.defaultTerminalProfile) {
					await StateServiceClient.updateDefaultTerminalProfile({
						value: defaultTerminalProfile || "default",
					} as StringRequest)
				}

				// Update the original state to reflect the saved changes
				originalState.current = {
					apiConfiguration,
					telemetrySetting,
					planActSeparateModelsSetting,
					enableCheckpointsSetting,
					mcpMarketplaceEnabled,
					mcpRichDisplayEnabled,
					mcpResponsesCollapsed,
					chatSettings,
					shellIntegrationTimeout,
					terminalReuseEnabled,
					terminalOutputLineLimit,
					defaultTerminalProfile,
				}
			}

			setHasUnsavedChanges(false)
			if (!withoutDone) {
				onDone()
			}
		} catch (error) {
			console.error("Failed to save settings:", error)
			vscode.postMessage({
				type: "grpc_request",
				grpc_request: {
					service: "ThirdPartyCodeReviewService",
					method: "updateThirdPartyReviewGlobalConfig",
					message: {},
					request_id: "error",
				},
			})
		}
	}

	useEffect(() => {
		setApiErrorMessage(undefined)
		setModelIdErrorMessage(undefined)
	}, [apiConfiguration])

	// Check for unsaved changes by comparing current state with original state
	useEffect(() => {
		const hasChanges =
			JSON.stringify(apiConfiguration) !== JSON.stringify(originalState.current.apiConfiguration) ||
			telemetrySetting !== originalState.current.telemetrySetting ||
			planActSeparateModelsSetting !== originalState.current.planActSeparateModelsSetting ||
			enableCheckpointsSetting !== originalState.current.enableCheckpointsSetting ||
			mcpMarketplaceEnabled !== originalState.current.mcpMarketplaceEnabled ||
			mcpRichDisplayEnabled !== originalState.current.mcpRichDisplayEnabled ||
			JSON.stringify(chatSettings) !== JSON.stringify(originalState.current.chatSettings) ||
			mcpResponsesCollapsed !== originalState.current.mcpResponsesCollapsed ||
			JSON.stringify(chatSettings) !== JSON.stringify(originalState.current.chatSettings) ||
			shellIntegrationTimeout !== originalState.current.shellIntegrationTimeout ||
			terminalOutputLineLimit !== originalState.current.terminalOutputLineLimit ||
			terminalReuseEnabled !== originalState.current.terminalReuseEnabled ||
			defaultTerminalProfile !== originalState.current.defaultTerminalProfile

		setHasUnsavedChanges(hasChanges)
	}, [
		apiConfiguration,
		telemetrySetting,
		planActSeparateModelsSetting,
		enableCheckpointsSetting,
		mcpMarketplaceEnabled,
		mcpRichDisplayEnabled,
		mcpResponsesCollapsed,
		chatSettings,
		shellIntegrationTimeout,
		terminalReuseEnabled,
		terminalOutputLineLimit,
		defaultTerminalProfile,
	])

	// Handle cancel button click
	const handleCancel = useCallback(() => {
		if (hasUnsavedChanges) {
			// Show confirmation dialog
			setIsUnsavedChangesDialogOpen(true)
			pendingAction.current = () => {
				// Reset all tracked state to original values
				setTelemetrySetting(originalState.current.telemetrySetting)
				setPlanActSeparateModelsSetting(originalState.current.planActSeparateModelsSetting)
				setChatSettings(originalState.current.chatSettings)
				if (typeof setApiConfiguration === "function") {
					setApiConfiguration(originalState.current.apiConfiguration ?? {})
				}
				if (typeof setEnableCheckpointsSetting === "function") {
					setEnableCheckpointsSetting(
						typeof originalState.current.enableCheckpointsSetting === "boolean"
							? originalState.current.enableCheckpointsSetting
							: false,
					)
				}
				if (typeof setMcpMarketplaceEnabled === "function") {
					setMcpMarketplaceEnabled(
						typeof originalState.current.mcpMarketplaceEnabled === "boolean"
							? originalState.current.mcpMarketplaceEnabled
							: false,
					)
				}
				if (typeof setMcpRichDisplayEnabled === "function") {
					setMcpRichDisplayEnabled(
						typeof originalState.current.mcpRichDisplayEnabled === "boolean"
							? originalState.current.mcpRichDisplayEnabled
							: true,
					)
				}
				// Reset terminal settings
				if (typeof setShellIntegrationTimeout === "function") {
					setShellIntegrationTimeout(originalState.current.shellIntegrationTimeout)
				}
				if (typeof setTerminalOutputLineLimit === "function") {
					setTerminalOutputLineLimit(originalState.current.terminalOutputLineLimit)
				}
				if (typeof setTerminalReuseEnabled === "function") {
					setTerminalReuseEnabled(originalState.current.terminalReuseEnabled ?? true)
				}
				if (typeof setDefaultTerminalProfile === "function") {
					setDefaultTerminalProfile(originalState.current.defaultTerminalProfile ?? "default")
				}
				if (typeof setMcpResponsesCollapsed === "function") {
					setMcpResponsesCollapsed(originalState.current.mcpResponsesCollapsed ?? false)
				}
				// Close settings view
				onDone()
			}
		} else {
			// No changes, just close
			onDone()
		}
	}, [
		hasUnsavedChanges,
		onDone,
		setTelemetrySetting,
		setPlanActSeparateModelsSetting,
		setChatSettings,
		setApiConfiguration,
		setEnableCheckpointsSetting,
		setMcpMarketplaceEnabled,
		setMcpRichDisplayEnabled,
		setMcpResponsesCollapsed,
	])

	// Handle confirmation dialog actions
	const handleConfirmDiscard = useCallback(() => {
		setIsUnsavedChangesDialogOpen(false)
		if (pendingAction.current) {
			pendingAction.current()
			pendingAction.current = undefined
		}
	}, [])

	const handleCancelDiscard = useCallback(() => {
		setIsUnsavedChangesDialogOpen(false)
		pendingAction.current = undefined
	}, [])

	// validate as soon as the component is mounted
	/*
	useEffect will use stale values of variables if they are not included in the dependency array. 
	so trying to use useEffect with a dependency array of only one value for example will use any 
	other variables' old values. In most cases you don't want this, and should opt to use react-use 
	hooks.
    
		// uses someVar and anotherVar
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [someVar])
	If we only want to run code once on mount we can use react-use's useEffectOnce or useMount
	*/

	const handleMessage = useCallback((event: MessageEvent) => {
		const message: ExtensionMessage = event.data
		switch (message.type) {
			// Handle tab navigation through targetSection prop instead
			case "grpc_response":
				if (message.grpc_response?.message?.action === "scrollToSettings") {
					const tabId = message.grpc_response?.message?.value
					if (tabId) {
						console.log("Opening settings tab from GRPC response:", tabId)
						// Check if the value corresponds to a valid tab ID
						const isValidTabId = SETTINGS_TABS.some((tab) => tab.id === tabId)

						if (isValidTabId) {
							// Set the active tab directly
							setActiveTab(tabId)
						} else {
							// Fall back to the old behavior of scrolling to an element
							setTimeout(() => {
								const element = document.getElementById(tabId)
								if (element) {
									element.scrollIntoView({ behavior: "smooth" })

									element.style.transition = "background-color 0.5s ease"
									element.style.backgroundColor = "var(--vscode-textPreformat-background)"

									setTimeout(() => {
										element.style.backgroundColor = "transparent"
									}, 1200)
								}
							}, 300)
						}
					}
				}
				break
		}
	}, [])

	useEvent("message", handleMessage)

	const handleResetState = async (resetGlobalState?: boolean) => {
		try {
			await StateServiceClient.resetState(
				ResetStateRequest.create({
					global: resetGlobalState,
				}),
			)
		} catch (error) {
			console.error("Failed to reset state:", error)
		}
	}

	const handlePlanActModeChange = async (tab: "plan" | "act") => {
		if (tab === chatSettings.mode) {
			return
		}

		// Update settings first to ensure any changes to the current tab are saved
		await handleSubmit(true)

		try {
			await StateServiceClient.togglePlanActMode(
				TogglePlanActModeRequest.create({
					chatSettings: {
						mode: tab === "plan" ? PlanActMode.PLAN : PlanActMode.ACT,
						preferredLanguage: chatSettings.preferredLanguage,
						openAiReasoningEffort: chatSettings.openAIReasoningEffort,
					},
				}),
			)
		} catch (error) {
			console.error("Failed to toggle Plan/Act mode:", error)
		}
	}

	// Track whether we're in compact mode
	const [isCompactMode, setIsCompactMode] = useState(false)
	const containerRef = useRef<HTMLDivElement>(null)

	// Setup resize observer to detect when we should switch to compact mode
	useEffect(() => {
		if (!containerRef.current) return

		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				// If container width is less than 500px, switch to compact mode
				setIsCompactMode(entry.contentRect.width < 500)
			}
		})

		observer.observe(containerRef.current)

		return () => {
			observer?.disconnect()
		}
	}, [])

	// 更新配置的回调函数
	const onUpdateProviderConfig = async (providerId: string, config: any) => {
		try {
			const currentConfig = await ThirdPartyCodeReviewServiceClient.getThirdPartyReviewGlobalConfig(
				GetThirdPartyReviewGlobalConfigRequest.create({}),
			)

			let configuredProvidersObj: Record<string, any> = {}
			if (currentConfig.config?.configuredProviders) {
				try {
					configuredProvidersObj = JSON.parse(currentConfig.config.configuredProviders)
				} catch (error) {
					console.error("解析当前配置失败:", error)
				}
			}

			// 确保配置对象可以序列化
			const serializableConfig = {
				apiKey: config.apiKey || "",
				endpoint: config.endpoint || "",
				timeout: Number(config.timeout || 30),
				retryAttempts: Number(config.retryAttempts || 3),
				customHeaders: config.customHeaders || {},
				rateLimits: config.rateLimits
					? {
							requestsPerMinute: Number(config.rateLimits.requestsPerMinute || 60),
							requestsPerDay: Number(config.rateLimits.requestsPerDay || 1000),
						}
					: undefined,
			}

			const newConfiguredProviders = {
				...configuredProvidersObj,
				[providerId]: serializableConfig,
			}

			console.log("更新配置:", {
				providerId,
				config: serializableConfig,
				newConfiguredProviders,
			})

			const response = await ThirdPartyCodeReviewServiceClient.updateThirdPartyReviewGlobalConfig(
				UpdateThirdPartyReviewGlobalConfigRequest.create({
					config: GlobalCodeReviewConfig.create({
						configuredProviders: JSON.stringify(newConfiguredProviders),
						enabledProviders: currentConfig.config?.enabledProviders || [],
					}),
				}),
			)

			if (!response.success) {
				throw new Error(response.errorMessage || "更新失败")
			}

			// 更新本地状态
			setConfiguredProviders((prev) => ({
				...prev,
				[providerId]: ThirdPartyProviderConfig.create(serializableConfig),
			}))
		} catch (error) {
			console.error("更新提供商配置失败:", error)
			throw error
		}
	}

	return (
		<Tab>
			<TabHeader className="flex justify-between items-center gap-2">
				<div className="flex items-center gap-1">
					<h3 className="text-[var(--vscode-foreground)] m-0">Settings</h3>
				</div>
				<div className="flex gap-2">
					<VSCodeButton appearance="secondary" onClick={handleCancel}>
						Cancel
					</VSCodeButton>
					<VSCodeButton onClick={() => handleSubmit(false)} disabled={!hasUnsavedChanges}>
						Save
					</VSCodeButton>
				</div>
			</TabHeader>

			{/* Vertical tabs layout */}
			<div ref={containerRef} className={`${settingsTabsContainer} ${isCompactMode ? "narrow" : ""}`}>
				{/* Tab sidebar */}
				<TabList value={activeTab} onValueChange={setActiveTab} className={settingsTabList} data-compact={isCompactMode}>
					{SETTINGS_TABS.map((tab) =>
						isCompactMode ? (
							<HeroTooltip key={tab.id} content={tab.tooltipText} placement="right">
								<div
									className={`${
										activeTab === tab.id
											? `${settingsTabTrigger} ${settingsTabTriggerActive}`
											: settingsTabTrigger
									} focus:ring-0`}
									data-compact={isCompactMode}
									data-testid={`tab-${tab.id}`}
									data-value={tab.id}
									onClick={() => {
										console.log("Compact tab clicked:", tab.id)
										setActiveTab(tab.id)
									}}>
									<div className={`flex items-center gap-2 ${isCompactMode ? "justify-center" : ""}`}>
										<tab.icon className="w-4 h-4" />
										<span className="tab-label">{tab.name}</span>
									</div>
								</div>
							</HeroTooltip>
						) : (
							<TabTrigger
								key={tab.id}
								value={tab.id}
								className={`${
									activeTab === tab.id
										? `${settingsTabTrigger} ${settingsTabTriggerActive}`
										: settingsTabTrigger
								} focus:ring-0`}
								data-compact={isCompactMode}
								data-testid={`tab-${tab.id}`}>
								<div className={`flex items-center gap-2 ${isCompactMode ? "justify-center" : ""}`}>
									<tab.icon className="w-4 h-4" />
									<span className="tab-label">{tab.name}</span>
								</div>
							</TabTrigger>
						),
					)}
				</TabList>

				{/* Helper function to render section header */}
				{(() => {
					const renderSectionHeader = (tabId: string) => {
						const tab = SETTINGS_TABS.find((t) => t.id === tabId)
						if (!tab) return null

						return (
							<SectionHeader>
								<div className="flex items-center gap-2">
									{(() => {
										const Icon = tab.icon
										return <Icon className="w-4" />
									})()}
									<div>{tab.headerText}</div>
								</div>
							</SectionHeader>
						)
					}

					return (
						<TabContent className="flex-1 overflow-auto">
							{/* API Configuration Tab */}
							{activeTab === "api-config" && (
								<div>
									{renderSectionHeader("api-config")}
									<Section>
										{/* Tabs container */}
										{planActSeparateModelsSetting ? (
											<div className="rounded-md mb-5 bg-[var(--vscode-panel-background)]">
												<div className="flex gap-[1px] mb-[10px] -mt-2 border-0 border-b border-solid border-[var(--vscode-panel-border)]">
													<TabButton
														isActive={chatSettings.mode === "plan"}
														onClick={() => handlePlanActModeChange("plan")}>
														Plan Mode
													</TabButton>
													<TabButton
														isActive={chatSettings.mode === "act"}
														onClick={() => handlePlanActModeChange("act")}>
														Act Mode
													</TabButton>
												</div>

												{/* Content container */}
												<div className="-mb-3">
													<ApiOptions
														key={chatSettings.mode}
														showModelOptions={true}
														apiErrorMessage={apiErrorMessage}
														modelIdErrorMessage={modelIdErrorMessage}
													/>
												</div>
											</div>
										) : (
											<ApiOptions
												key={"single"}
												showModelOptions={true}
												apiErrorMessage={apiErrorMessage}
												modelIdErrorMessage={modelIdErrorMessage}
											/>
										)}

										<div className="mb-[5px]">
											<VSCodeCheckbox
												className="mb-[5px]"
												checked={planActSeparateModelsSetting}
												onChange={(e: any) => {
													const checked = e.target.checked === true
													setPlanActSeparateModelsSetting(checked)
												}}>
												Use different models for Plan and Act modes
											</VSCodeCheckbox>
											<p className="text-xs mt-[5px] text-[var(--vscode-descriptionForeground)]">
												Switching between Plan and Act mode will persist the API and model used in the
												previous mode. This may be helpful e.g. when using a strong reasoning model to
												architect a plan for a cheaper coding model to act on.
											</p>
										</div>
									</Section>
								</div>
							)}

							{/* General Settings Tab */}
							{activeTab === "general" && (
								<div>
									{renderSectionHeader("general")}
									<Section>
										{chatSettings && (
											<PreferredLanguageSetting
												chatSettings={chatSettings}
												setChatSettings={setChatSettings}
											/>
										)}

										<div className="mb-[5px]">
											<VSCodeCheckbox
												className="mb-[5px]"
												checked={telemetrySetting !== "disabled"}
												onChange={(e: any) => {
													const checked = e.target.checked === true
													setTelemetrySetting(checked ? "enabled" : "disabled")
												}}>
												Allow anonymous error and usage reporting
											</VSCodeCheckbox>
											<p className="text-xs mt-[5px] text-[var(--vscode-descriptionForeground)]">
												Help improve Cline by sending anonymous usage data and error reports. No code,
												prompts, or personal information are ever sent. See our{" "}
												<VSCodeLink
													href="https://docs.cline.bot/more-info/telemetry"
													className="text-inherit">
													telemetry overview
												</VSCodeLink>{" "}
												and{" "}
												<VSCodeLink href="https://cline.bot/privacy" className="text-inherit">
													privacy policy
												</VSCodeLink>{" "}
												for more details.
											</p>
										</div>
									</Section>
								</div>
							)}

							{/* Feature Settings Tab */}
							{activeTab === "features" && (
								<div>
									{renderSectionHeader("features")}
									<Section>
										<FeatureSettingsSection />
									</Section>
								</div>
							)}

							{/* Browser Settings Tab */}
							{activeTab === "browser" && (
								<div>
									{renderSectionHeader("browser")}
									<Section>
										<BrowserSettingsSection />
									</Section>
								</div>
							)}

							{/* Terminal Settings Tab */}
							{activeTab === "terminal" && (
								<div>
									{renderSectionHeader("terminal")}
									<Section>
										<TerminalSettingsSection />
									</Section>
								</div>
							)}

							{/* Code Review Settings Tab */}
							{activeTab === "code-review" && (
								<div>
									{renderSectionHeader("code-review")}
									<Section>
										<ThirdPartyCodeReviewSettings
											configuredProviders={configuredProviders}
											enabledProviders={enabledProviders}
											onUpdateProviderConfig={onUpdateProviderConfig}
											onEnableProvider={async (providerId, enabled) => {
												try {
													const currentConfig =
														await ThirdPartyCodeReviewServiceClient.getThirdPartyReviewGlobalConfig(
															GetThirdPartyReviewGlobalConfigRequest.create({}),
														)

													const currentEnabled = currentConfig.config?.enabledProviders || []
													const newEnabled = enabled
														? [
																...currentEnabled.filter((id: string) => id !== providerId),
																providerId,
															]
														: currentEnabled.filter((id: string) => id !== providerId)

													const response =
														await ThirdPartyCodeReviewServiceClient.updateThirdPartyReviewGlobalConfig(
															UpdateThirdPartyReviewGlobalConfigRequest.create({
																config: GlobalCodeReviewConfig.create({
																	configuredProviders:
																		currentConfig.config?.configuredProviders || "{}",
																	enabledProviders: newEnabled,
																}),
															}),
														)

													if (!response.success) {
														throw new Error(response.errorMessage || "更新失败")
													}

													// 更新本地状态
													setEnabledProviders(newEnabled)
												} catch (error) {
													console.error("启用/禁用提供商失败:", error)
													throw error
												}
											}}
											onRemoveProvider={async (providerId) => {
												try {
													const currentConfig =
														await ThirdPartyCodeReviewServiceClient.getThirdPartyReviewGlobalConfig(
															GetThirdPartyReviewGlobalConfigRequest.create({}),
														)

													const configuredProvidersObj = currentConfig.config?.configuredProviders
														? JSON.parse(currentConfig.config.configuredProviders)
														: {}

													delete configuredProvidersObj[providerId]

													const response =
														await ThirdPartyCodeReviewServiceClient.updateThirdPartyReviewGlobalConfig(
															UpdateThirdPartyReviewGlobalConfigRequest.create({
																config: GlobalCodeReviewConfig.create({
																	configuredProviders: JSON.stringify(configuredProvidersObj),
																	enabledProviders: (
																		currentConfig.config?.enabledProviders || []
																	).filter((id: string) => id !== providerId),
																}),
															}),
														)

													if (!response.success) {
														throw new Error(response.errorMessage || "删除失败")
													}

													// 更新本地状态
													setConfiguredProviders(configuredProvidersObj)
													setEnabledProviders((prev) => prev.filter((id) => id !== providerId))
												} catch (error) {
													console.error("删除提供商失败:", error)
													throw error
												}
											}}
											onTestConnection={async (providerId) => {
												try {
													const response =
														await ThirdPartyCodeReviewServiceClient.testProviderConnection(
															TestProviderConnectionRequest.create({
																providerId,
															}),
														)
													return response.status
												} catch (error) {
													console.error("测试连接失败:", error)
													throw error
												}
											}}
										/>
									</Section>
								</div>
							)}

							{/* Debug Tab (only in dev mode) */}
							{IS_DEV && activeTab === "debug" && (
								<div>
									{renderSectionHeader("debug")}
									<Section>
										<VSCodeButton
											onClick={() => handleResetState()}
											className="mt-[5px] w-auto"
											style={{ backgroundColor: "var(--vscode-errorForeground)", color: "black" }}>
											Reset Workspace State
										</VSCodeButton>
										<VSCodeButton
											onClick={() => handleResetState(true)}
											className="mt-[5px] w-auto"
											style={{ backgroundColor: "var(--vscode-errorForeground)", color: "black" }}>
											Reset Global State
										</VSCodeButton>
										<p className="text-xs mt-[5px] text-[var(--vscode-descriptionForeground)]">
											This will reset all global state and secret storage in the extension.
										</p>
									</Section>
								</div>
							)}

							{/* About Tab */}
							{activeTab === "about" && (
								<div>
									{renderSectionHeader("about")}
									<Section>
										<div className="text-center text-[var(--vscode-descriptionForeground)] text-xs leading-[1.2] px-0 py-0 pr-2 pb-[15px] mt-auto">
											<p className="break-words m-0 p-0">
												If you have any questions or feedback, feel free to open an issue at{" "}
												<VSCodeLink href="https://github.com/cline/cline" className="inline">
													https://github.com/cline/cline
												</VSCodeLink>
											</p>
											<p className="italic mt-[10px] mb-0 p-0">v{version}</p>
										</div>
									</Section>
								</div>
							)}
						</TabContent>
					)
				})()}
			</div>

			{/* Unsaved Changes Dialog */}
			<UnsavedChangesDialog
				open={isUnsavedChangesDialogOpen}
				onOpenChange={setIsUnsavedChangesDialogOpen}
				onConfirm={handleConfirmDiscard}
				onCancel={handleCancelDiscard}
			/>
		</Tab>
	)
}

export default memo(SettingsView)
