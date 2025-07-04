/**
 * 第三方代码审查提供商配置和规范
 *
 * 这个文件定义了第三方代码审查服务的标准化接口，
 * 支持多种常见的代码审查工具和服务。
 */

import {
	ThirdPartyCodeReviewProvider,
	ThirdPartyProviderConfig,
	ThirdPartyAnalysisResult,
	ThirdPartyBatchResult,
	ProviderHealthStatus,
	CodeReviewFeature,
	AnalysisOptions,
	FileInput,
	CodeIssue,
	CodeReviewType,
	SeverityLevel,
	AnalysisStatistics,
} from "./CodeReviewService"

// ===== 通用提供商配置模板 =====

export interface ProviderConfigTemplate {
	name: string
	description: string
	supportedLanguages: string[]
	supportedFeatures: CodeReviewFeature[]
	requiredConfig: string[]
	optionalConfig: string[]
	configExample: ThirdPartyProviderConfig
	documentationUrl?: string
}

// ===== 内置提供商配置模板 =====

export const PROVIDER_TEMPLATES: Record<string, ProviderConfigTemplate> = {
	sonarqube: {
		name: "SonarQube",
		description: "Comprehensive static code analysis platform",
		supportedLanguages: ["javascript", "typescript", "java", "python", "csharp", "cpp", "go", "php", "swift", "kotlin"],
		supportedFeatures: [
			CodeReviewFeature.SECURITY_SCAN,
			CodeReviewFeature.QUALITY_ANALYSIS,
			CodeReviewFeature.COMPLEXITY_ANALYSIS,
			CodeReviewFeature.VULNERABILITY_SCAN,
			CodeReviewFeature.DEPENDENCY_CHECK,
		],
		requiredConfig: ["endpoint", "apiKey"],
		optionalConfig: ["timeout", "retryAttempts", "customHeaders", "projectKey"],
		configExample: {
			endpoint: "https://sonarqube.example.com",
			apiKey: "your-sonarqube-token",
			timeout: 30000,
			retryAttempts: 3,
			customHeaders: {
				"X-Project-Key": "your-project-key",
			},
		},
		documentationUrl: "https://docs.sonarqube.org/latest/extend/web-api/",
	},

	codeclimate: {
		name: "CodeClimate",
		description: "Automated code review for maintainability and quality",
		supportedLanguages: ["javascript", "typescript", "ruby", "python", "php", "swift", "go", "scss", "coffeescript"],
		supportedFeatures: [
			CodeReviewFeature.QUALITY_ANALYSIS,
			CodeReviewFeature.COMPLEXITY_ANALYSIS,
			CodeReviewFeature.STYLE_CHECK,
		],
		requiredConfig: ["apiKey"],
		optionalConfig: ["timeout", "retryAttempts", "repoId"],
		configExample: {
			apiKey: "your-codeclimate-token",
			timeout: 30000,
			retryAttempts: 3,
			customHeaders: {
				"Content-Type": "application/vnd.api+json",
			},
		},
		documentationUrl: "https://developer.codeclimate.com/",
	},

	eslint: {
		name: "ESLint",
		description: "Pluggable JavaScript linter",
		supportedLanguages: ["javascript", "typescript"],
		supportedFeatures: [CodeReviewFeature.QUALITY_ANALYSIS, CodeReviewFeature.STYLE_CHECK],
		requiredConfig: [],
		optionalConfig: ["configPath", "rulesDir", "extensions"],
		configExample: {
			timeout: 10000,
			customHeaders: {},
		},
		documentationUrl: "https://eslint.org/docs/developer-guide/",
	},

	semgrep: {
		name: "Semgrep",
		description: "Static analysis tool for security and correctness",
		supportedLanguages: ["javascript", "typescript", "python", "java", "go", "ruby", "php", "csharp", "scala"],
		supportedFeatures: [
			CodeReviewFeature.SECURITY_SCAN,
			CodeReviewFeature.VULNERABILITY_SCAN,
			CodeReviewFeature.QUALITY_ANALYSIS,
		],
		requiredConfig: ["apiKey"],
		optionalConfig: ["timeout", "rules", "configPath"],
		configExample: {
			apiKey: "your-semgrep-token",
			endpoint: "https://semgrep.dev/api/v1",
			timeout: 60000,
			retryAttempts: 2,
		},
		documentationUrl: "https://semgrep.dev/docs/",
	},

	codeql: {
		name: "CodeQL",
		description: "GitHub's semantic code analysis engine",
		supportedLanguages: ["javascript", "typescript", "python", "java", "csharp", "cpp", "go", "ruby"],
		supportedFeatures: [
			CodeReviewFeature.SECURITY_SCAN,
			CodeReviewFeature.VULNERABILITY_SCAN,
			CodeReviewFeature.QUALITY_ANALYSIS,
		],
		requiredConfig: ["apiKey", "endpoint"],
		optionalConfig: ["timeout", "database", "queries"],
		configExample: {
			apiKey: "your-github-token",
			endpoint: "https://api.github.com",
			timeout: 120000,
			retryAttempts: 2,
			customHeaders: {
				Accept: "application/vnd.github.v3+json",
			},
		},
		documentationUrl: "https://docs.github.com/en/code-security/codeql-cli",
	},
}

// ===== 抽象基类实现 =====

export abstract class BaseThirdPartyProvider implements ThirdPartyCodeReviewProvider {
	abstract readonly providerId: string
	abstract readonly providerName: string
	abstract readonly version: string

	protected config?: ThirdPartyProviderConfig
	protected template: ProviderConfigTemplate

	constructor(template: ProviderConfigTemplate) {
		this.template = template
	}

	async initialize(config: ThirdPartyProviderConfig): Promise<void> {
		this.validateConfig(config)
		this.config = config

		// 执行健康检查确保配置正确
		const health = await this.healthCheck()
		if (!health.isHealthy) {
			throw new Error(`Provider initialization failed: ${health.errorMessage}`)
		}
	}

	protected validateConfig(config: ThirdPartyProviderConfig): void {
		for (const required of this.template.requiredConfig) {
			if (!(required in config) || !config[required as keyof ThirdPartyProviderConfig]) {
				throw new Error(`Missing required configuration: ${required}`)
			}
		}
	}

	getSupportedLanguages(): string[] {
		return this.template.supportedLanguages
	}

	getSupportedFeatures(): CodeReviewFeature[] {
		return this.template.supportedFeatures
	}

	// 抽象方法，需要具体实现
	abstract analyzeFile(filePath: string, content: string, options?: AnalysisOptions): Promise<ThirdPartyAnalysisResult>
	abstract analyzeBatch(files: FileInput[], options?: AnalysisOptions): Promise<ThirdPartyBatchResult>
	abstract healthCheck(): Promise<ProviderHealthStatus>

	// 通用辅助方法
	protected async makeApiRequest(url: string, options: RequestInit = {}): Promise<Response> {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), this.config?.timeout || 30000)

		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal,
				headers: {
					...options.headers,
					...this.config?.customHeaders,
				},
			})

			clearTimeout(timeoutId)
			return response
		} catch (error) {
			clearTimeout(timeoutId)
			throw error
		}
	}

	protected createAnalysisResult(
		issues: CodeIssue[] = [],
		processingTime: number = 0,
		rawResponse?: any,
	): ThirdPartyAnalysisResult {
		const statistics = this.calculateStatistics(issues)

		return {
			providerId: this.providerId,
			providerVersion: this.version,
			analysisId: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
			timestamp: new Date().toISOString(),
			processingTime,
			issues,
			statistics,
			suggestions: [],
			rawResponse,
		}
	}

	protected calculateStatistics(issues: CodeIssue[]): AnalysisStatistics {
		const issuesByType = Object.values(CodeReviewType).reduce(
			(acc, type) => {
				acc[type] = issues.filter((issue) => issue.type === type).length
				return acc
			},
			{} as Record<CodeReviewType, number>,
		)

		const issuesBySeverity = Object.values(SeverityLevel).reduce(
			(acc, severity) => {
				acc[severity] = issues.filter((issue) => issue.severity === severity).length
				return acc
			},
			{} as Record<SeverityLevel, number>,
		)

		return {
			totalLines: 0,
			codeLines: 0,
			commentLines: 0,
			blankLines: 0,
			complexity: 0,
			maintainabilityIndex: 0,
			issuesByType,
			issuesBySeverity,
		}
	}
}

// ===== 具体提供商实现示例 =====

export class CodeClimateProvider extends BaseThirdPartyProvider {
	readonly providerId = "codeclimate"
	readonly providerName = "CodeClimate"
	readonly version = "1.0.0"

	constructor() {
		super(PROVIDER_TEMPLATES.codeclimate)
	}

	async analyzeFile(filePath: string, content: string, options?: AnalysisOptions): Promise<ThirdPartyAnalysisResult> {
		const startTime = Date.now()

		try {
			// 实现 CodeClimate API 调用
			const response = await this.makeApiRequest("https://api.codeclimate.com/v1/repos/analysis", {
				method: "POST",
				headers: {
					Authorization: `Token ${this.config?.apiKey}`,
					"Content-Type": "application/vnd.api+json",
				},
				body: JSON.stringify({
					data: {
						type: "analysis",
						attributes: {
							file_path: filePath,
							content: content,
						},
					},
				}),
			})

			if (!response.ok) {
				throw new Error(`CodeClimate API error: ${response.status} ${response.statusText}`)
			}

			const data = await response.json()
			const issues = this.transformCodeClimateResponse(data, filePath)

			return this.createAnalysisResult(issues, Date.now() - startTime, data)
		} catch (error) {
			throw new Error(`CodeClimate analysis failed: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	async analyzeBatch(files: FileInput[], options?: AnalysisOptions): Promise<ThirdPartyBatchResult> {
		const batchId = `batch_${Date.now()}`
		const results: ThirdPartyAnalysisResult[] = []
		const failedFiles: Array<{ filePath: string; error: string }> = []

		for (const file of files) {
			try {
				const result = await this.analyzeFile(file.filePath, file.content, options)
				results.push(result)
			} catch (error) {
				failedFiles.push({
					filePath: file.filePath,
					error: error instanceof Error ? error.message : String(error),
				})
			}
		}

		return {
			providerId: this.providerId,
			batchId,
			timestamp: new Date().toISOString(),
			totalFiles: files.length,
			processedFiles: results.length,
			failedFiles,
			results,
			overallStatistics: this.calculateOverallStatistics(results),
		}
	}

	async healthCheck(): Promise<ProviderHealthStatus> {
		const startTime = Date.now()

		try {
			const response = await this.makeApiRequest("https://api.codeclimate.com/v1/user", {
				headers: {
					Authorization: `Token ${this.config?.apiKey}`,
				},
			})

			const responseTime = Date.now() - startTime

			if (response.ok) {
				return {
					isHealthy: true,
					responseTime,
					lastChecked: new Date().toISOString(),
				}
			} else {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`)
			}
		} catch (error) {
			return {
				isHealthy: false,
				responseTime: Date.now() - startTime,
				lastChecked: new Date().toISOString(),
				errorMessage: error instanceof Error ? error.message : String(error),
			}
		}
	}

	private transformCodeClimateResponse(response: any, filePath: string): CodeIssue[] {
		// 转换 CodeClimate 响应为标准格式
		if (!response.data || !Array.isArray(response.data)) {
			return []
		}

		return response.data.map((issue: any) => ({
			id: issue.id,
			type: this.mapCodeClimateCategory(issue.attributes?.categories?.[0]),
			severity: this.mapCodeClimateSeverity(issue.attributes?.severity),
			file: filePath,
			line: issue.attributes?.location?.start_line || 1,
			column: issue.attributes?.location?.start_column,
			endLine: issue.attributes?.location?.end_line,
			endColumn: issue.attributes?.location?.end_column,
			message: issue.attributes?.description || "No description",
			suggestion: issue.attributes?.remediation_points
				? `Estimated effort: ${issue.attributes.remediation_points} points`
				: undefined,
			ruleId: issue.attributes?.check_name,
			source: this.providerId,
			confidence: issue.attributes?.confidence || 0.5,
		}))
	}

	private mapCodeClimateCategory(category: string): CodeReviewType {
		const mapping: Record<string, CodeReviewType> = {
			"Bug Risk": CodeReviewType.BUG,
			Clarity: CodeReviewType.QUALITY,
			Compatibility: CodeReviewType.QUALITY,
			Complexity: CodeReviewType.QUALITY,
			Duplication: CodeReviewType.QUALITY,
			Performance: CodeReviewType.PERFORMANCE,
			Security: CodeReviewType.SECURITY,
			Style: CodeReviewType.STYLE,
		}
		return mapping[category] || CodeReviewType.QUALITY
	}

	private mapCodeClimateSeverity(severity: string): SeverityLevel {
		const mapping: Record<string, SeverityLevel> = {
			blocker: SeverityLevel.CRITICAL,
			critical: SeverityLevel.CRITICAL,
			major: SeverityLevel.HIGH,
			minor: SeverityLevel.MEDIUM,
			info: SeverityLevel.LOW,
		}
		return mapping[severity] || SeverityLevel.MEDIUM
	}

	private calculateOverallStatistics(results: ThirdPartyAnalysisResult[]): AnalysisStatistics {
		return results.reduce(
			(acc, result) => {
				acc.totalLines += result.statistics.totalLines
				acc.codeLines += result.statistics.codeLines
				acc.commentLines += result.statistics.commentLines
				acc.blankLines += result.statistics.blankLines
				acc.complexity += result.statistics.complexity

				Object.values(CodeReviewType).forEach((type) => {
					acc.issuesByType[type] = (acc.issuesByType[type] || 0) + (result.statistics.issuesByType[type] || 0)
				})

				Object.values(SeverityLevel).forEach((severity) => {
					acc.issuesBySeverity[severity] =
						(acc.issuesBySeverity[severity] || 0) + (result.statistics.issuesBySeverity[severity] || 0)
				})

				return acc
			},
			{
				totalLines: 0,
				codeLines: 0,
				commentLines: 0,
				blankLines: 0,
				complexity: 0,
				maintainabilityIndex: 0,
				issuesByType: {} as Record<CodeReviewType, number>,
				issuesBySeverity: {} as Record<SeverityLevel, number>,
			},
		)
	}
}

// ===== 提供商工厂 =====

export class ProviderFactory {
	private static registeredProviders: Map<string, () => ThirdPartyCodeReviewProvider> = new Map()

	static {
		// 注册内置提供商
		this.registerProvider(
			"sonarqube",
			() =>
				new (class extends BaseThirdPartyProvider {
					readonly providerId = "sonarqube"
					readonly providerName = "SonarQube"
					readonly version = "1.0.0"

					constructor() {
						super(PROVIDER_TEMPLATES.sonarqube)
					}

					async analyzeFile(): Promise<ThirdPartyAnalysisResult> {
						// 实现 SonarQube 分析逻辑
						return this.createAnalysisResult()
					}

					async analyzeBatch(): Promise<ThirdPartyBatchResult> {
						// 实现批量分析逻辑
						throw new Error("Not implemented")
					}

					async healthCheck(): Promise<ProviderHealthStatus> {
						// 实现健康检查
						return {
							isHealthy: true,
							responseTime: 100,
							lastChecked: new Date().toISOString(),
						}
					}
				})(),
		)

		this.registerProvider("codeclimate", () => new CodeClimateProvider())
	}

	static registerProvider(providerId: string, factory: () => ThirdPartyCodeReviewProvider): void {
		this.registeredProviders.set(providerId, factory)
	}

	static createProvider(providerId: string): ThirdPartyCodeReviewProvider {
		const factory = this.registeredProviders.get(providerId)
		if (!factory) {
			throw new Error(`Unknown provider: ${providerId}`)
		}
		return factory()
	}

	static getAvailableProviders(): string[] {
		return Array.from(this.registeredProviders.keys())
	}

	static getProviderTemplate(providerId: string): ProviderConfigTemplate | undefined {
		return PROVIDER_TEMPLATES[providerId]
	}
}

// ===== 配置验证工具 =====

export class ConfigValidator {
	static validateProviderConfig(providerId: string, config: ThirdPartyProviderConfig): { isValid: boolean; errors: string[] } {
		const template = PROVIDER_TEMPLATES[providerId]
		if (!template) {
			return { isValid: false, errors: [`Unknown provider: ${providerId}`] }
		}

		const errors: string[] = []

		// 检查必需配置
		for (const required of template.requiredConfig) {
			if (!(required in config) || !config[required as keyof ThirdPartyProviderConfig]) {
				errors.push(`Missing required configuration: ${required}`)
			}
		}

		// 验证端点 URL 格式
		if (config.endpoint) {
			try {
				new URL(config.endpoint)
			} catch {
				errors.push("Invalid endpoint URL format")
			}
		}

		// 验证超时设置
		if (config.timeout && (config.timeout < 1000 || config.timeout > 300000)) {
			errors.push("Timeout must be between 1000ms and 300000ms")
		}

		// 验证重试次数
		if (config.retryAttempts && (config.retryAttempts < 0 || config.retryAttempts > 10)) {
			errors.push("Retry attempts must be between 0 and 10")
		}

		return { isValid: errors.length === 0, errors }
	}

	static generateConfigExample(providerId: string): ThirdPartyProviderConfig | null {
		const template = PROVIDER_TEMPLATES[providerId]
		return template ? { ...template.configExample } : null
	}
}

// ===== 设置管理功能 =====

/**
 * 第三方代码审查提供商设置管理器
 * 负责管理用户配置的第三方提供商设置
 */
export class ThirdPartyProvidersSettingsManager {
	private providers: Map<string, ThirdPartyProviderConfig> = new Map()
	private enabledProviders: Set<string> = new Set()

	constructor() {
		this.loadFromSettings()
	}

	/**
	 * 从设置中加载提供商配置
	 */
	private loadFromSettings(): void {
		// TODO: 从VSCode设置或持久化存储中加载配置
		// 这里可以添加从vscode.workspace.getConfiguration()读取配置的逻辑
	}

	/**
	 * 保存设置到持久化存储
	 */
	private async saveToSettings(): Promise<void> {
		// TODO: 保存到VSCode设置或持久化存储
		// 这里可以添加保存到vscode.workspace.getConfiguration()的逻辑
	}

	/**
	 * 获取所有配置的提供商
	 */
	getConfiguredProviders(): Record<string, ThirdPartyProviderConfig> {
		return Object.fromEntries(this.providers)
	}

	/**
	 * 获取启用的提供商ID列表
	 */
	getEnabledProviders(): string[] {
		return Array.from(this.enabledProviders)
	}

	/**
	 * 添加或更新提供商配置
	 */
	async setProviderConfig(providerId: string, config: ThirdPartyProviderConfig): Promise<void> {
		// 验证配置
		const validation = ConfigValidator.validateProviderConfig(providerId, config)
		if (!validation.isValid) {
			throw new Error(`Configuration validation failed: ${validation.errors.join(", ")}`)
		}

		this.providers.set(providerId, config)
		await this.saveToSettings()
	}

	/**
	 * 删除提供商配置
	 */
	async removeProviderConfig(providerId: string): Promise<void> {
		this.providers.delete(providerId)
		this.enabledProviders.delete(providerId)
		await this.saveToSettings()
	}

	/**
	 * 启用提供商
	 */
	async enableProvider(providerId: string): Promise<void> {
		if (!this.providers.has(providerId)) {
			throw new Error(`Provider ${providerId} is not configured`)
		}

		this.enabledProviders.add(providerId)
		await this.saveToSettings()
	}

	/**
	 * 禁用提供商
	 */
	async disableProvider(providerId: string): Promise<void> {
		this.enabledProviders.delete(providerId)
		await this.saveToSettings()
	}

	/**
	 * 检查提供商是否已启用
	 */
	isProviderEnabled(providerId: string): boolean {
		return this.enabledProviders.has(providerId)
	}

	/**
	 * 获取提供商配置
	 */
	getProviderConfig(providerId: string): ThirdPartyProviderConfig | undefined {
		return this.providers.get(providerId)
	}

	/**
	 * 测试提供商连接
	 */
	async testProviderConnection(providerId: string): Promise<ProviderHealthStatus> {
		const config = this.providers.get(providerId)
		if (!config) {
			return {
				isHealthy: false,
				responseTime: 0,
				lastChecked: new Date().toISOString(),
				errorMessage: "Provider not configured",
			}
		}

		try {
			const provider = ProviderFactory.createProvider(providerId)
			await provider.initialize(config)
			return await provider.healthCheck()
		} catch (error) {
			return {
				isHealthy: false,
				responseTime: 0,
				lastChecked: new Date().toISOString(),
				errorMessage: error instanceof Error ? error.message : String(error),
			}
		}
	}

	/**
	 * 导入配置
	 */
	async importConfig(config: {
		providers: Record<string, ThirdPartyProviderConfig>
		enabledProviders: string[]
	}): Promise<void> {
		// 验证所有配置
		for (const [providerId, providerConfig] of Object.entries(config.providers)) {
			const validation = ConfigValidator.validateProviderConfig(providerId, providerConfig)
			if (!validation.isValid) {
				throw new Error(`Invalid configuration for ${providerId}: ${validation.errors.join(", ")}`)
			}
		}

		// 导入配置
		this.providers.clear()
		this.enabledProviders.clear()

		for (const [providerId, providerConfig] of Object.entries(config.providers)) {
			this.providers.set(providerId, providerConfig)
		}

		for (const providerId of config.enabledProviders) {
			if (this.providers.has(providerId)) {
				this.enabledProviders.add(providerId)
			}
		}

		await this.saveToSettings()
	}

	/**
	 * 导出配置
	 */
	exportConfig(): {
		providers: Record<string, ThirdPartyProviderConfig>
		enabledProviders: string[]
	} {
		return {
			providers: this.getConfiguredProviders(),
			enabledProviders: this.getEnabledProviders(),
		}
	}
}

// ===== 设置UI辅助工具 =====

/**
 * 为设置UI提供的工具函数
 */
export class SettingsUIHelpers {
	/**
	 * 获取可用的提供商模板
	 */
	static getAvailableProviderTemplates(): ProviderConfigTemplate[] {
		return Object.entries(PROVIDER_TEMPLATES).map(
			([id, template]) =>
				({
					...template,
					providerId: id,
				}) as ProviderConfigTemplate & { providerId: string },
		)
	}

	/**
	 * 为提供商生成默认配置
	 */
	static generateDefaultConfig(providerId: string): ThirdPartyProviderConfig | null {
		const template = PROVIDER_TEMPLATES[providerId]
		if (!template) {
			return null
		}

		return { ...template.configExample }
	}

	/**
	 * 获取提供商的配置字段描述
	 */
	static getConfigFieldDescriptions(providerId: string): Record<string, string> {
		const descriptions: Record<string, Record<string, string>> = {
			sonarqube: {
				endpoint: "SonarQube服务器的URL地址",
				apiKey: "SonarQube用户令牌",
				timeout: "请求超时时间（毫秒）",
				retryAttempts: "失败重试次数",
				projectKey: "项目标识符",
			},
			codeclimate: {
				apiKey: "CodeClimate API令牌",
				timeout: "请求超时时间（毫秒）",
				retryAttempts: "失败重试次数",
				repoId: "仓库ID（可选）",
			},
			eslint: {
				configPath: "ESLint配置文件路径",
				rulesDir: "自定义规则目录",
				extensions: "检查的文件扩展名",
			},
			semgrep: {
				apiKey: "Semgrep API令牌",
				endpoint: "Semgrep服务端点",
				timeout: "请求超时时间（毫秒）",
				rules: "自定义规则配置",
				configPath: "配置文件路径",
			},
			codeql: {
				apiKey: "GitHub令牌",
				endpoint: "GitHub API端点",
				timeout: "请求超时时间（毫秒）",
				database: "CodeQL数据库",
				queries: "查询配置",
			},
		}

		return descriptions[providerId] || {}
	}

	/**
	 * 验证单个配置字段
	 */
	static validateConfigField(providerId: string, fieldName: string, value: any): string | null {
		const template = PROVIDER_TEMPLATES[providerId]
		if (!template) {
			return "未知的提供商"
		}

		// 检查必需字段
		if (template.requiredConfig.includes(fieldName) && (!value || value === "")) {
			return "此字段为必需字段"
		}

		// 字段特定验证
		switch (fieldName) {
			case "endpoint":
				if (value && typeof value === "string") {
					try {
						new URL(value)
					} catch {
						return "请输入有效的URL格式"
					}
				}
				break
			case "timeout":
				if (value !== undefined && (isNaN(value) || value < 1000 || value > 300000)) {
					return "超时时间必须在1000-300000毫秒之间"
				}
				break
			case "retryAttempts":
				if (value !== undefined && (isNaN(value) || value < 0 || value > 10)) {
					return "重试次数必须在0-10之间"
				}
				break
			case "apiKey":
				if (value && typeof value === "string" && value.length < 10) {
					return "API密钥长度似乎过短，请检查"
				}
				break
		}

		return null
	}
}

// 全局设置管理器实例
export const globalSettingsManager = new ThirdPartyProvidersSettingsManager()
