import { useState, useEffect, FormEvent } from "react"
import {
	VSCodeButton,
	VSCodeTextField,
	VSCodeDropdown,
	VSCodeOption,
	VSCodeProgressRing,
	VSCodeDivider,
} from "@vscode/webview-ui-toolkit/react"
import styled from "styled-components"
import { Shield, Check, X, AlertCircle, Trash, Settings, Eye, EyeOff } from "lucide-react"
import { ThirdPartyCodeReviewServiceClient } from "../../services/grpc-client"
import {
	ThirdPartyProviderConfig,
	ProviderConfigTemplate,
	ProviderHealthStatus,
	GetAvailableProvidersRequest,
	GetConfiguredProvidersRequest,
	UpdateProviderConfigRequest,
	EnableProviderRequest,
	RemoveProviderRequest,
	TestProviderConnectionRequest,
	ValidateConfigFieldRequest,
	RateLimits,
} from "@shared/proto/third_party_code_review"

// 样式定义
const Container = styled.div`
	padding: 16px;
	max-height: 600px;
	overflow-y: auto;
`

const Header = styled.div`
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 16px;

	h3 {
		margin: 0;
		color: var(--vscode-foreground);
	}
`

const ProvidersGrid = styled.div`
	display: grid;
	gap: 16px;
	margin-bottom: 20px;
`

const ProviderCard = styled.div<{ $enabled?: boolean }>`
	border: 1px solid var(--vscode-widget-border);
	border-radius: 4px;
	padding: 24px;
	background: var(--vscode-editor-background);
	opacity: ${(props) => (props.$enabled === false ? 0.6 : 1)};
	transition: all 0.2s ease;

	&:hover {
		border-color: var(--vscode-focusBorder);
	}
`

const ProviderHeader = styled.div`
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 16px;
	gap: 12px;

	h4 {
		margin: 0;
		color: var(--vscode-foreground);
		flex: 1;
		font-size: 16px;
	}
`

const StatusBadge = styled.div<{ $status: "healthy" | "unhealthy" | "unknown" }>`
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 2px 8px;
	border-radius: 12px;
	font-size: 12px;
	background: ${(props) => {
		switch (props.$status) {
			case "healthy":
				return "var(--vscode-terminal-ansiGreen)"
			case "unhealthy":
				return "var(--vscode-terminal-ansiRed)"
			default:
				return "var(--vscode-terminal-ansiYellow)"
		}
	}};
	color: var(--vscode-editor-background);
	cursor: help;
`

const ConfigSection = styled.div`
	margin: 20px 0;
	padding: 16px;
	background: var(--vscode-textCodeBlock-background);
	border-radius: 4px;
`

const FormField = styled.div`
	margin-bottom: 12px;

	label {
		display: block;
		margin-bottom: 4px;
		color: var(--vscode-foreground);
		font-size: 13px;
	}

	vscode-text-field {
		width: 100%;
		min-height: 32px;

		&::part(control) {
			height: 32px;
			padding: 4px 8px;
			font-size: 14px;
		}
	}
`

const ErrorMessage = styled.div`
	color: var(--vscode-errorForeground);
	font-size: 12px;
	margin-top: 4px;
`

const ButtonGroup = styled.div`
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
	margin-top: 12px;
`

const AddProviderSection = styled.div`
	border: 1px dashed var(--vscode-widget-border);
	border-radius: 4px;
	padding: 16px;
	margin-bottom: 20px;
	background: var(--vscode-editor-background);
`

const InfoSection = styled.div`
	margin-top: 12px;
	padding: 12px;
	background: var(--vscode-textCodeBlock-background);
	border-radius: 4px;
	font-size: 12px;
	color: var(--vscode-descriptionForeground);

	strong {
		color: var(--vscode-foreground);
	}
`

const PasswordField = styled.div`
	position: relative;

	vscode-button {
		position: absolute;
		right: 4px;
		top: 50%;
		transform: translateY(-50%);
		min-width: unset;
		padding: 4px;
		background: transparent;
		border: none;

		&:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}
	}
`

const HeadersSection = styled.div`
	margin-top: 12px;
	border-top: 1px solid var(--vscode-widget-border);
	padding-top: 12px;
`

const HeaderRow = styled.div`
	display: grid;
	grid-template-columns: 1fr 1fr auto;
	gap: 8px;
	margin-bottom: 8px;
	align-items: start;
`

const HeadersTitle = styled.div`
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 12px;

	h5 {
		margin: 0;
		font-size: 13px;
		color: var(--vscode-foreground);
	}
`

interface ConfigFieldProps {
	providerId: string
	fieldName: string
	label: string
	type?: "text" | "password" | "number"
	value: string
	onChange: (value: string) => void
	error?: string
}

const ConfigField: React.FC<ConfigFieldProps> = ({ providerId, fieldName, label, type = "text", value, onChange, error }) => {
	const [showPassword, setShowPassword] = useState(false)
	const handleInput = (e: InputEvent) => {
		const target = e.target as HTMLInputElement
		const newValue = type === "number" ? Number(target.value) : target.value
		onChange(String(newValue))
	}

	const togglePasswordVisibility = () => {
		setShowPassword(!showPassword)
	}

	return (
		<FormField>
			<label>{label}</label>
			{type === "password" ? (
				<PasswordField>
					<VSCodeTextField
						type={showPassword ? "text" : "password"}
						value={value}
						onInput={handleInput as any}
						placeholder={`请输入${label}...`}
					/>
					<VSCodeButton
						appearance="secondary"
						onClick={togglePasswordVisibility}
						title={showPassword ? "隐藏密码" : "显示密码"}>
						{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
					</VSCodeButton>
				</PasswordField>
			) : (
				<VSCodeTextField
					type={type === "number" ? "text" : type}
					value={value}
					onInput={handleInput as any}
					placeholder={`请输入${label}...`}
				/>
			)}
			{error && <ErrorMessage>{error}</ErrorMessage>}
		</FormField>
	)
}

interface HeaderItem {
	key: string
	value: string
}

const CustomHeadersField: React.FC<{
	headers: Record<string, string>
	onChange: (headers: Record<string, string>) => void
}> = ({ headers, onChange }) => {
	const [headerItems, setHeaderItems] = useState<HeaderItem[]>(() => {
		return Object.entries(headers).map(([key, value]) => ({ key, value }))
	})

	useEffect(() => {
		const newHeaders = headerItems.reduce(
			(acc, item) => {
				if (item.key.trim()) {
					acc[item.key.trim()] = item.value
				}
				return acc
			},
			{} as Record<string, string>,
		)
		onChange(newHeaders)
	}, [headerItems])

	const addHeader = () => {
		setHeaderItems([...headerItems, { key: "", value: "" }])
	}

	const removeHeader = (index: number) => {
		setHeaderItems(headerItems.filter((_, i) => i !== index))
	}

	const updateHeader = (index: number, field: "key" | "value", value: string) => {
		const newItems = [...headerItems]
		newItems[index] = { ...newItems[index], [field]: value }
		setHeaderItems(newItems)
	}

	return (
		<HeadersSection>
			<HeadersTitle>
				<h5>自定义请求头</h5>
				<VSCodeButton appearance="secondary" onClick={addHeader}>
					添加请求头
				</VSCodeButton>
			</HeadersTitle>
			{headerItems.map((item, index) => (
				<HeaderRow key={index}>
					<VSCodeTextField
						placeholder="Header 名称"
						value={item.key}
						onInput={(e: any) => updateHeader(index, "key", e.target.value)}
					/>
					<VSCodeTextField
						placeholder="Header 值"
						value={item.value}
						onInput={(e: any) => updateHeader(index, "value", e.target.value)}
					/>
					<VSCodeButton appearance="secondary" onClick={() => removeHeader(index)}>
						<Trash size={14} />
					</VSCodeButton>
				</HeaderRow>
			))}
		</HeadersSection>
	)
}

interface Props {
	configuredProviders: Record<string, ThirdPartyProviderConfig>
	enabledProviders: string[]
	onUpdateProviderConfig: (providerId: string, config: any) => Promise<void>
	onEnableProvider: (providerId: string, enabled: boolean) => Promise<void>
	onRemoveProvider: (providerId: string) => Promise<void>
	onTestConnection: (providerId: string) => Promise<any>
}

export default function ThirdPartyCodeReviewSettings({
	configuredProviders: initialConfiguredProviders,
	enabledProviders: initialEnabledProviders,
	onUpdateProviderConfig,
	onEnableProvider,
	onRemoveProvider,
	onTestConnection,
}: Props) {
	console.log("ThirdPartyCodeReviewSettings 组件接收到的初始数据:", {
		initialConfiguredProviders,
		initialEnabledProviders,
	})

	const [availableProviders, setAvailableProviders] = useState<ProviderConfigTemplate[]>([])
	const [configuredProviders, setConfiguredProviders] =
		useState<Record<string, ThirdPartyProviderConfig>>(initialConfiguredProviders)
	const [enabledProviders, setEnabledProviders] = useState<string[]>(initialEnabledProviders)
	const [editingConfigs, setEditingConfigs] = useState<Record<string, ThirdPartyProviderConfig>>({})
	const [validationErrors, setValidationErrors] = useState<Record<string, Record<string, string>>>({})
	const [selectedNewProvider, setSelectedNewProvider] = useState<string>("")
	const [isLoading, setIsLoading] = useState(true)
	const [connectionStatuses, setConnectionStatuses] = useState<Record<string, ProviderHealthStatus>>({})
	const [testingConnection, setTestingConnection] = useState<Record<string, boolean>>({})
	const defaultProviderConfig = ThirdPartyProviderConfig.create({
		apiKey: "",
		endpoint: "",
		timeout: 30,
		retryAttempts: 3,
		customHeaders: {},
		rateLimits: RateLimits.create({
			requestsPerMinute: 60,
			requestsPerDay: 1000,
		}),
	})

	// 加载数据
	useEffect(() => {
		loadData()
	}, [])

	const loadData = async () => {
		try {
			setIsLoading(true)

			console.log("开始加载提供商数据...")
			// 只获取可用的提供商列表
			const availableResponse = await ThirdPartyCodeReviewServiceClient.getAvailableProviders(
				GetAvailableProvidersRequest.create({}),
			)

			console.log("获取到的可用提供商:", availableResponse)

			if (availableResponse.providers) {
				setAvailableProviders(availableResponse.providers)
			} else {
				console.error("服务器未返回可用提供商")
				setAvailableProviders([])
			}

			// 使用父组件传入的配置
			console.log("使用父组件传入的配置:", {
				configuredProviders: initialConfiguredProviders,
				enabledProviders: initialEnabledProviders,
			})

			// 初始化编辑配置
			const editConfigs: Record<string, ThirdPartyProviderConfig> = {}
			Object.entries(initialConfiguredProviders).forEach(([id, config]) => {
				console.log(`初始化提供商 ${id} 的编辑配置:`, config)
				if (config) {
					editConfigs[id] = ThirdPartyProviderConfig.create({
						...defaultProviderConfig,
						...config,
					})
				}
			})
			console.log("设置编辑配置:", editConfigs)
			setEditingConfigs(editConfigs)

			// 获取每个已配置提供商的连接状态
			const statusPromises = Object.keys(initialConfiguredProviders).map(async (providerId) => {
				try {
					console.log(`获取提供商 ${providerId} 的连接状态...`)
					const response = await ThirdPartyCodeReviewServiceClient.testProviderConnection(
						TestProviderConnectionRequest.create({
							providerId,
						}),
					)

					if (response.status) {
						console.log(`提供商 ${providerId} 的连接状态:`, response.status)
						setConnectionStatuses((prev) => ({
							...prev,
							[providerId]: response.status,
						}))
					} else {
						console.error(`无法获取提供商 ${providerId} 的连接状态`)
						setConnectionStatuses((prev) => ({
							...prev,
							[providerId]: ProviderHealthStatus.create({
								isHealthy: false,
								responseTime: 0,
								lastChecked: new Date().toISOString(),
								errorMessage: "无法获取连接状态",
							}),
						}))
					}
				} catch (error) {
					console.error(`获取提供商 ${providerId} 的连接状态失败:`, error)
					setConnectionStatuses((prev) => ({
						...prev,
						[providerId]: ProviderHealthStatus.create({
							isHealthy: false,
							responseTime: 0,
							lastChecked: new Date().toISOString(),
							errorMessage: error instanceof Error ? error.message : "获取状态失败",
						}),
					}))
				}
			})

			await Promise.all(statusPromises)
		} catch (error) {
			console.error("加载第三方代码审查数据失败:", error)
			setAvailableProviders([])
		} finally {
			setIsLoading(false)
		}
	}

	// 获取提供商模板
	const getProviderTemplate = (providerId: string): ProviderConfigTemplate | undefined => {
		try {
			return availableProviders.find((p) => p.providerId === providerId)
		} catch (error) {
			console.error("Failed to get provider template:", error)
			return undefined
		}
	}

	// 添加新提供商
	const handleAddProvider = async () => {
		if (!selectedNewProvider) return

		try {
			const template = getProviderTemplate(selectedNewProvider)
			if (!template) {
				console.error("Provider template not found:", selectedNewProvider)
				return
			}

			// 创建新的提供商配置
			const newConfig = ThirdPartyProviderConfig.create({
				...defaultProviderConfig,
				...template.configExample,
			})

			// 更新状态
			setConfiguredProviders((prev) => ({
				...prev,
				[selectedNewProvider]: newConfig,
			}))

			setEditingConfigs((prev) => ({
				...prev,
				[selectedNewProvider]: newConfig,
			}))

			// 重置选择
			setSelectedNewProvider("")

			// 更新连接状态
			setConnectionStatuses((prev) => ({
				...prev,
				[selectedNewProvider]: ProviderHealthStatus.create({
					isHealthy: false,
					responseTime: 0,
					lastChecked: new Date().toISOString(),
					errorMessage: "新添加的提供商，尚未测试连接",
				}),
			}))
		} catch (error) {
			console.error("Failed to add provider:", error)
		}
	}

	// 更新字段值
	const updateField = async (providerId: string, fieldName: keyof ThirdPartyProviderConfig, value: any) => {
		try {
			// 更新编辑配置
			setEditingConfigs((prev) => ({
				...prev,
				[providerId]: ThirdPartyProviderConfig.create({
					...prev[providerId],
					[fieldName]: value,
				}),
			}))

			// 验证字段
			const response = await ThirdPartyCodeReviewServiceClient.validateConfigField(
				ValidateConfigFieldRequest.create({
					providerId,
					fieldName,
					fieldValue: String(value),
				}),
			)

			if (!response.isValid) {
				setValidationErrors((prev) => ({
					...prev,
					[providerId]: {
						...prev[providerId],
						[fieldName]: response.errorMessage || "字段验证失败",
					},
				}))
			} else {
				setValidationErrors((prev) => {
					const newErrors = { ...prev }
					if (newErrors[providerId]) {
						delete newErrors[providerId][fieldName]
						if (Object.keys(newErrors[providerId]).length === 0) {
							delete newErrors[providerId]
						}
					}
					return newErrors
				})
			}
		} catch (error) {
			console.error("Failed to update field:", error)
			setValidationErrors((prev) => ({
				...prev,
				[providerId]: {
					...prev[providerId],
					[fieldName]: error instanceof Error ? error.message : "字段更新失败",
				},
			}))
		}
	}

	// 保存配置
	const handleSaveConfig = async (providerId: string) => {
		try {
			const config = editingConfigs[providerId]
			if (!config) {
				console.error("No editing config found for provider:", providerId)
				return
			}

			const response = await ThirdPartyCodeReviewServiceClient.updateProviderConfig(
				UpdateProviderConfigRequest.create({
					providerId,
					config,
				}),
			)

			if (response.success) {
				setConfiguredProviders((prev) => ({
					...prev,
					[providerId]: config,
				}))

				await onUpdateProviderConfig(providerId, config)
			} else {
				console.error("Failed to save config:", response.errorMessage)
				setConnectionStatuses((prev) => ({
					...prev,
					[providerId]: ProviderHealthStatus.create({
						isHealthy: false,
						responseTime: 0,
						lastChecked: new Date().toISOString(),
						errorMessage: response.errorMessage || "保存配置失败",
					}),
				}))
			}
		} catch (error) {
			console.error("Failed to save config:", error)
			setConnectionStatuses((prev) => ({
				...prev,
				[providerId]: ProviderHealthStatus.create({
					isHealthy: false,
					responseTime: 0,
					lastChecked: new Date().toISOString(),
					errorMessage: error instanceof Error ? error.message : "保存配置失败",
				}),
			}))
		}
	}

	// 启用/禁用提供商
	const handleToggleProvider = async (providerId: string, enabled: boolean) => {
		try {
			const response = await ThirdPartyCodeReviewServiceClient.enableProvider(
				EnableProviderRequest.create({
					providerId,
					enabled,
				}),
			)

			if (response.success) {
				setEnabledProviders((prev) => {
					if (enabled) {
						return [...prev, providerId]
					} else {
						return prev.filter((id) => id !== providerId)
					}
				})

				await onEnableProvider(providerId, enabled)
			} else {
				console.error("Failed to toggle provider:", response.errorMessage)
				setConnectionStatuses((prev) => ({
					...prev,
					[providerId]: ProviderHealthStatus.create({
						isHealthy: false,
						responseTime: 0,
						lastChecked: new Date().toISOString(),
						errorMessage: response.errorMessage || (enabled ? "启用失败" : "禁用失败"),
					}),
				}))
			}
		} catch (error) {
			console.error("Failed to toggle provider:", error)
			setConnectionStatuses((prev) => ({
				...prev,
				[providerId]: ProviderHealthStatus.create({
					isHealthy: false,
					responseTime: 0,
					lastChecked: new Date().toISOString(),
					errorMessage: error instanceof Error ? error.message : enabled ? "启用失败" : "禁用失败",
				}),
			}))
		}
	}

	// 删除提供商
	const handleRemoveProvider = async (providerId: string) => {
		try {
			const response = await ThirdPartyCodeReviewServiceClient.removeProvider(
				RemoveProviderRequest.create({
					providerId,
				}),
			)

			if (response.success) {
				setConfiguredProviders((prev) => {
					const newConfig = { ...prev }
					delete newConfig[providerId]
					return newConfig
				})

				setEditingConfigs((prev) => {
					const newConfig = { ...prev }
					delete newConfig[providerId]
					return newConfig
				})

				setEnabledProviders((prev) => prev.filter((id) => id !== providerId))

				setConnectionStatuses((prev) => {
					const newStatuses = { ...prev }
					delete newStatuses[providerId]
					return newStatuses
				})

				await onRemoveProvider(providerId)
			} else {
				console.error("Failed to remove provider:", response.errorMessage)
				setConnectionStatuses((prev) => ({
					...prev,
					[providerId]: ProviderHealthStatus.create({
						isHealthy: false,
						responseTime: 0,
						lastChecked: new Date().toISOString(),
						errorMessage: response.errorMessage || "删除提供商失败",
					}),
				}))
			}
		} catch (error) {
			console.error("Failed to remove provider:", error)
			setConnectionStatuses((prev) => ({
				...prev,
				[providerId]: ProviderHealthStatus.create({
					isHealthy: false,
					responseTime: 0,
					lastChecked: new Date().toISOString(),
					errorMessage: error instanceof Error ? error.message : "删除提供商失败",
				}),
			}))
		}
	}

	// 测试连接
	const handleTestConnection = async (providerId: string) => {
		try {
			setTestingConnection((prev) => ({ ...prev, [providerId]: true }))

			const response = await ThirdPartyCodeReviewServiceClient.testProviderConnection(
				TestProviderConnectionRequest.create({
					providerId,
				}),
			)

			if (response.status) {
				setConnectionStatuses((prev) => ({
					...prev,
					[providerId]: response.status,
				}))

				await onTestConnection(providerId)
			} else {
				setConnectionStatuses((prev) => ({
					...prev,
					[providerId]: ProviderHealthStatus.create({
						isHealthy: false,
						responseTime: 0,
						lastChecked: new Date().toISOString(),
						errorMessage: "无法获取连接状态",
					}),
				}))
			}
		} catch (error) {
			console.error("Failed to test connection:", error)
			setConnectionStatuses((prev) => ({
				...prev,
				[providerId]: ProviderHealthStatus.create({
					isHealthy: false,
					responseTime: 0,
					lastChecked: new Date().toISOString(),
					errorMessage: error instanceof Error ? error.message : "连接测试失败",
				}),
			}))
		} finally {
			setTestingConnection((prev) => ({ ...prev, [providerId]: false }))
		}
	}

	// 渲染配置字段
	const renderConfigField = (
		providerId: string,
		fieldName: string,
		label: string,
		type: "text" | "password" | "number" = "text",
	) => {
		const config = editingConfigs[providerId] || defaultProviderConfig
		const value = String(config[fieldName as keyof ThirdPartyProviderConfig] ?? "")
		const error = validationErrors[providerId]?.[fieldName]

		return (
			<ConfigField
				key={fieldName}
				providerId={providerId}
				fieldName={fieldName}
				label={label}
				type={type}
				value={value}
				onChange={(value) => updateField(providerId, fieldName as keyof ThirdPartyProviderConfig, value)}
				error={error}
			/>
		)
	}

	// 渲染自定义请求头
	const renderCustomHeaders = (providerId: string) => {
		const config = editingConfigs[providerId] || defaultProviderConfig
		return (
			<CustomHeadersField
				headers={config.customHeaders || {}}
				onChange={(headers) => {
					updateField(providerId, "customHeaders", headers)
				}}
			/>
		)
	}

	// 获取连接状态
	const getConnectionStatus = (providerId: string): "healthy" | "unhealthy" | "unknown" => {
		const status = connectionStatuses[providerId]
		if (!status) return "unknown"
		return status.isHealthy ? "healthy" : "unhealthy"
	}

	if (isLoading) {
		return (
			<Container>
				<Header>
					<VSCodeProgressRing />
					<h3>加载第三方代码审查设置...</h3>
				</Header>
			</Container>
		)
	}

	return (
		<Container>
			{/* <Header>
				<Shield size={20} color="var(--vscode-symbolIcon-constructorForeground)" />
				<h3>第三方代码审查提供商</h3>
			</Header> */}

			{/* 添加新提供商 */}
			<AddProviderSection>
				<h4>添加新提供商</h4>
				<FormField>
					<label>选择提供商类型</label>
					<VSCodeDropdown value={selectedNewProvider} onChange={(e: any) => setSelectedNewProvider(e.target.value)}>
						<VSCodeOption value="">选择提供商...</VSCodeOption>
						{availableProviders
							.filter((provider) => !configuredProviders[provider.providerId])
							.map((provider) => (
								<VSCodeOption key={provider.providerId} value={provider.providerId}>
									{provider.name}
								</VSCodeOption>
							))}
					</VSCodeDropdown>
				</FormField>

				{selectedNewProvider && (
					<div>
						<p style={{ margin: "8px 0", fontSize: "13px", color: "var(--vscode-descriptionForeground)" }}>
							{getProviderTemplate(selectedNewProvider)?.description}
						</p>
						<VSCodeButton onClick={handleAddProvider}>添加提供商</VSCodeButton>
					</div>
				)}
			</AddProviderSection>

			{/* 已配置的提供商 */}
			<ProvidersGrid>
				{Object.entries(configuredProviders).map(([providerId, config]) => {
					const template = getProviderTemplate(providerId)
					const isEnabled = enabledProviders.includes(providerId)
					const connectionStatus = getConnectionStatus(providerId)
					const isTesting = testingConnection[providerId]

					return (
						<ProviderCard key={providerId} $enabled={isEnabled}>
							<ProviderHeader>
								<h4>{template?.name || providerId}</h4>
								<StatusBadge
									$status={connectionStatus}
									title={connectionStatuses[providerId]?.errorMessage || undefined}>
									{connectionStatus === "healthy" && <Check size={12} />}
									{connectionStatus === "unhealthy" && <X size={12} />}
									{connectionStatus === "unknown" && <AlertCircle size={12} />}
									{connectionStatus === "healthy" ? "正常" : connectionStatus === "unhealthy" ? "异常" : "未知"}
								</StatusBadge>
							</ProviderHeader>

							<ConfigSection>
								{renderConfigField(providerId, "apiKey", "API密钥", "password")}
								{renderConfigField(providerId, "endpoint", "端点URL")}
								{renderConfigField(providerId, "timeout", "超时时间(秒)", "number")}
								{renderConfigField(providerId, "retryAttempts", "重试次数", "number")}
								{renderCustomHeaders(providerId)}
							</ConfigSection>

							<ButtonGroup>
								<VSCodeButton appearance="primary" onClick={() => handleSaveConfig(providerId)}>
									<Settings size={14} />
									保存配置
								</VSCodeButton>

								<VSCodeButton
									onClick={() => handleToggleProvider(providerId, !isEnabled)}
									appearance={isEnabled ? "secondary" : "primary"}>
									{isEnabled ? "禁用" : "启用"}
								</VSCodeButton>

								<VSCodeButton onClick={() => handleTestConnection(providerId)} disabled={isTesting}>
									{isTesting ? <VSCodeProgressRing /> : "测试连接"}
								</VSCodeButton>

								<VSCodeButton appearance="secondary" onClick={() => handleRemoveProvider(providerId)}>
									<Trash size={14} />
									删除
								</VSCodeButton>
							</ButtonGroup>

							{template && (
								<InfoSection>
									<strong>支持的语言:</strong> {template.supportedLanguages.join(", ")}
									<br />
									<strong>功能:</strong> {template.supportedFeatures.join(", ")}
									{template.documentationUrl && (
										<>
											<br />
											<strong>文档:</strong>{" "}
											<a href={template.documentationUrl} target="_blank" rel="noopener noreferrer">
												查看文档
											</a>
										</>
									)}
								</InfoSection>
							)}
						</ProviderCard>
					)
				})}
			</ProvidersGrid>

			{Object.keys(configuredProviders).length === 0 && (
				<div
					style={{
						textAlign: "center",
						padding: "40px",
						color: "var(--vscode-descriptionForeground)",
					}}>
					<Shield size={48} style={{ opacity: 0.5, marginBottom: "16px" }} />
					<p>尚未配置任何第三方代码审查提供商</p>
					<p style={{ fontSize: "13px" }}>请使用上方的表单添加新的提供商</p>
				</div>
			)}
		</Container>
	)
}
