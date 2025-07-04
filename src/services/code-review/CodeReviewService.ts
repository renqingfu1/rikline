import * as vscode from "vscode"
import * as fs from "fs"
import * as path from "path"
import { ApiHandler, buildApiHandler } from "../../api"
import { ApiConfiguration } from "../../shared/api"
import { Anthropic } from "@anthropic-ai/sdk"

// 第三方代码审查接口标准规范
export interface ThirdPartyCodeReviewProvider {
	// 提供商标识
	readonly providerId: string
	readonly providerName: string
	readonly version: string

	// 初始化配置
	initialize(config: ThirdPartyProviderConfig): Promise<void>

	// 核心审查方法
	analyzeFile(filePath: string, content: string, options?: AnalysisOptions): Promise<ThirdPartyAnalysisResult>
	analyzeBatch(files: FileInput[], options?: AnalysisOptions): Promise<ThirdPartyBatchResult>

	// 能力查询
	getSupportedLanguages(): string[]
	getSupportedFeatures(): CodeReviewFeature[]

	// 健康检查
	healthCheck(): Promise<ProviderHealthStatus>
}

// 第三方提供商配置接口
export interface ThirdPartyProviderConfig {
	apiKey?: string
	endpoint?: string
	timeout?: number
	retryAttempts?: number
	customHeaders?: Record<string, string>
	rateLimits?: {
		requestsPerMinute: number
		requestsPerDay: number
	}
}

// 分析选项
export interface AnalysisOptions {
	// 审查类型
	reviewTypes?: CodeReviewType[]
	// 严重程度过滤
	severityFilter?: SeverityLevel[]
	// 语言特定选项
	languageSpecific?: Record<string, any>
	// 自定义规则
	customRules?: CustomRule[]
	// 排除规则
	excludeRules?: string[]
}

// 文件输入
export interface FileInput {
	filePath: string
	content: string
	language?: string
	encoding?: string
}

// 第三方分析结果
export interface ThirdPartyAnalysisResult {
	// 提供商信息
	providerId: string
	providerVersion: string

	// 分析元数据
	analysisId: string
	timestamp: string
	processingTime: number

	// 问题列表
	issues: CodeIssue[]

	// 统计信息
	statistics: AnalysisStatistics

	// 建议
	suggestions: CodeSuggestion[]

	// 原始响应（可选）
	rawResponse?: any
}

// 批量分析结果
export interface ThirdPartyBatchResult {
	providerId: string
	batchId: string
	timestamp: string
	totalFiles: number
	processedFiles: number
	failedFiles: FileError[]
	results: ThirdPartyAnalysisResult[]
	overallStatistics: AnalysisStatistics
}

// 提供商健康状态
export interface ProviderHealthStatus {
	isHealthy: boolean
	responseTime: number
	lastChecked: string
	errorMessage?: string
	quotaStatus?: {
		used: number
		limit: number
		resetTime?: string
	}
}

// 支持的语言类型
export type SupportedLanguage = {
	name: string
	extensions: string[]
	aliases?: string[]
}

// 代码审查功能
export enum CodeReviewFeature {
	SECURITY_SCAN = "security_scan",
	QUALITY_ANALYSIS = "quality_analysis",
	PERFORMANCE_CHECK = "performance_check",
	STYLE_CHECK = "style_check",
	COMPLEXITY_ANALYSIS = "complexity_analysis",
	DEPENDENCY_CHECK = "dependency_check",
	LICENSE_CHECK = "license_check",
	VULNERABILITY_SCAN = "vulnerability_scan",
}

// 代码审查类型
export enum CodeReviewType {
	SECURITY = "security",
	QUALITY = "quality",
	PERFORMANCE = "performance",
	STYLE = "style",
	BUG = "bug",
	MAINTAINABILITY = "maintainability",
}

// 严重程度
export enum SeverityLevel {
	CRITICAL = "critical",
	HIGH = "high",
	MEDIUM = "medium",
	LOW = "low",
	INFO = "info",
}

// AI分析结果
export interface AIAnalysisResult {
	suggestions: string[]
	confidence: number
	category: string
}

// 第三方分析工具结果
export interface ThirdPartyAnalysisResultLegacy {
	toolName: string
	issues: CodeIssue[]
	raw?: any
}

export interface CodeIssue {
	// 基本信息
	id?: string
	type: CodeReviewType
	severity: SeverityLevel
	category?: string

	// 位置信息
	file: string
	line: number
	column?: number
	endLine?: number
	endColumn?: number

	// 描述信息
	message: string
	description?: string
	suggestion?: string

	// 规则信息
	ruleId?: string
	ruleName?: string
	ruleDocUrl?: string

	// 元数据
	confidence?: number
	source?: string
	tags?: string[]

	// 修复建议
	fixes?: CodeFix[]
}

// 代码修复建议
export interface CodeFix {
	description: string
	type: "replace" | "insert" | "delete"
	range: {
		start: { line: number; column: number }
		end: { line: number; column: number }
	}
	newText?: string
}

// 自定义规则
export interface CustomRule {
	id: string
	name: string
	description: string
	pattern?: string
	severity: SeverityLevel
	languages: string[]
}

// 分析统计
export interface AnalysisStatistics {
	totalLines: number
	codeLines: number
	commentLines: number
	blankLines: number
	complexity: number
	maintainabilityIndex: number
	technicalDebt?: number
	issuesByType: Record<CodeReviewType, number>
	issuesBySeverity: Record<SeverityLevel, number>
}

// 代码建议
export interface CodeSuggestion {
	type: "improvement" | "optimization" | "refactoring"
	title: string
	description: string
	impact: "high" | "medium" | "low"
	effort: "high" | "medium" | "low"
	file?: string
	line?: number
}

// 文件错误
export interface FileError {
	filePath: string
	error: string
	errorCode?: string
}

// 代码审查结果
export interface CodeReviewResult {
	summary: {
		totalIssues: number
		criticalIssues: number
		highIssues: number
		mediumIssues: number
		lowIssues: number
	}
	issues: CodeIssue[]
	metrics: {
		linesOfCode: number
		complexity: number
		maintainabilityIndex: number
	}
	// 新增第三方结果
	thirdPartyResults?: ThirdPartyAnalysisResult[]
}

// 内置第三方提供商示例
export class SonarQubeProvider implements ThirdPartyCodeReviewProvider {
	readonly providerId = "sonarqube"
	readonly providerName = "SonarQube"
	readonly version = "1.0.0"

	private config?: ThirdPartyProviderConfig

	async initialize(config: ThirdPartyProviderConfig): Promise<void> {
		this.config = config
		// 验证配置和连接
		await this.healthCheck()
	}

	async analyzeFile(filePath: string, content: string, options?: AnalysisOptions): Promise<ThirdPartyAnalysisResult> {
		// SonarQube API调用实现
		const response = await this.callSonarQubeAPI({
			files: [{ path: filePath, content }],
			options,
		})

		return this.transformSonarQubeResponse(response)
	}

	async analyzeBatch(files: FileInput[], options?: AnalysisOptions): Promise<ThirdPartyBatchResult> {
		const batchId = `batch_${Date.now()}`
		const results: ThirdPartyAnalysisResult[] = []
		const failedFiles: FileError[] = []

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

	getSupportedLanguages(): string[] {
		return ["javascript", "typescript", "java", "python", "csharp", "cpp", "go", "php"]
	}

	getSupportedFeatures(): CodeReviewFeature[] {
		return [
			CodeReviewFeature.SECURITY_SCAN,
			CodeReviewFeature.QUALITY_ANALYSIS,
			CodeReviewFeature.COMPLEXITY_ANALYSIS,
			CodeReviewFeature.VULNERABILITY_SCAN,
		]
	}

	async healthCheck(): Promise<ProviderHealthStatus> {
		const startTime = Date.now()
		try {
			// 调用SonarQube健康检查API
			const response = await fetch(`${this.config?.endpoint}/api/system/health`, {
				headers: {
					Authorization: `Bearer ${this.config?.apiKey}`,
					...this.config?.customHeaders,
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

	private async callSonarQubeAPI(params: any): Promise<any> {
		// SonarQube API调用实现
		const response = await fetch(`${this.config?.endpoint}/api/issues/search`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.config?.apiKey}`,
				...this.config?.customHeaders,
			},
			body: JSON.stringify(params),
		})

		if (!response.ok) {
			throw new Error(`SonarQube API error: ${response.status} ${response.statusText}`)
		}

		return response.json()
	}

	private transformSonarQubeResponse(response: any): ThirdPartyAnalysisResult {
		// 转换SonarQube响应为标准格式
		const issues: CodeIssue[] =
			response.issues?.map((issue: any) => ({
				id: issue.key,
				type: this.mapSonarQubeType(issue.type),
				severity: this.mapSonarQubeSeverity(issue.severity),
				file: issue.component,
				line: issue.line || 1,
				column: issue.column,
				message: issue.message,
				ruleId: issue.rule,
				source: this.providerId,
			})) || []

		return {
			providerId: this.providerId,
			providerVersion: this.version,
			analysisId: `analysis_${Date.now()}`,
			timestamp: new Date().toISOString(),
			processingTime: 0,
			issues,
			statistics: this.calculateStatistics(issues),
			suggestions: [],
			rawResponse: response,
		}
	}

	private mapSonarQubeType(sonarType: string): CodeReviewType {
		const mapping: Record<string, CodeReviewType> = {
			BUG: CodeReviewType.BUG,
			VULNERABILITY: CodeReviewType.SECURITY,
			CODE_SMELL: CodeReviewType.QUALITY,
			SECURITY_HOTSPOT: CodeReviewType.SECURITY,
		}
		return mapping[sonarType] || CodeReviewType.QUALITY
	}

	private mapSonarQubeSeverity(sonarSeverity: string): SeverityLevel {
		const mapping: Record<string, SeverityLevel> = {
			BLOCKER: SeverityLevel.CRITICAL,
			CRITICAL: SeverityLevel.CRITICAL,
			MAJOR: SeverityLevel.HIGH,
			MINOR: SeverityLevel.MEDIUM,
			INFO: SeverityLevel.LOW,
		}
		return mapping[sonarSeverity] || SeverityLevel.MEDIUM
	}

	private calculateStatistics(issues: CodeIssue[]): AnalysisStatistics {
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

	private calculateOverallStatistics(results: ThirdPartyAnalysisResult[]): AnalysisStatistics {
		// 聚合所有结果的统计信息
		return results.reduce(
			(acc, result) => {
				acc.totalLines += result.statistics.totalLines
				acc.codeLines += result.statistics.codeLines
				acc.commentLines += result.statistics.commentLines
				acc.blankLines += result.statistics.blankLines
				acc.complexity += result.statistics.complexity

				// 聚合问题统计
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

// 代码审查服务主类
export class CodeReviewService {
	private static instance: CodeReviewService
	private supportedLanguages: Map<string, SupportedLanguage>
	private apiHandler: ApiHandler
	private thirdPartyProviders: Map<string, ThirdPartyCodeReviewProvider>

	private constructor(config: ApiConfiguration) {
		this.supportedLanguages = new Map()
		this.apiHandler = buildApiHandler(config)
		this.thirdPartyProviders = new Map()
		this.initializeSupportedLanguages()
		this.initializeDefaultProviders()
	}

	private initializeSupportedLanguages() {
		const languages: SupportedLanguage[] = [
			{
				name: "JavaScript",
				extensions: [".js", ".jsx"],
				aliases: ["js", "javascript"],
			},
			{
				name: "TypeScript",
				extensions: [".ts", ".tsx"],
				aliases: ["ts", "typescript"],
			},
			{
				name: "Python",
				extensions: [".py"],
				aliases: ["py", "python"],
			},
			{
				name: "Java",
				extensions: [".java"],
				aliases: ["java"],
			},
			{
				name: "Go",
				extensions: [".go"],
				aliases: ["go", "golang"],
			},
			{
				name: "Rust",
				extensions: [".rs"],
				aliases: ["rs", "rust"],
			},
		]

		languages.forEach((lang) => {
			lang.extensions.forEach((ext) => {
				this.supportedLanguages.set(ext, lang)
			})
		})
	}

	private initializeDefaultProviders() {
		// 注册默认的第三方提供商
		const sonarQubeProvider = new SonarQubeProvider()
		this.thirdPartyProviders.set(sonarQubeProvider.providerId, sonarQubeProvider)
	}

	public static getInstance(config: ApiConfiguration): CodeReviewService {
		if (!CodeReviewService.instance) {
			CodeReviewService.instance = new CodeReviewService(config)
		}
		return CodeReviewService.instance
	}

	public updateApiConfiguration(config: ApiConfiguration) {
		this.apiHandler = buildApiHandler(config)
	}

	// 注册第三方提供商
	public registerProvider(provider: ThirdPartyCodeReviewProvider): void {
		this.thirdPartyProviders.set(provider.providerId, provider)
	}

	// 获取所有可用的提供商
	public getAvailableProviders(): ThirdPartyCodeReviewProvider[] {
		return Array.from(this.thirdPartyProviders.values())
	}

	// 配置第三方提供商
	public async configureProvider(providerId: string, config: ThirdPartyProviderConfig): Promise<void> {
		const provider = this.thirdPartyProviders.get(providerId)
		if (!provider) {
			throw new Error(`Provider ${providerId} not found`)
		}
		await provider.initialize(config)
	}

	/**
	 * 分析指定文件的代码质量（包含第三方提供商）
	 */
	public async analyzeFile(
		filePath: string,
		options?: {
			enableThirdParty?: boolean
			providers?: string[]
			analysisOptions?: AnalysisOptions
		},
	): Promise<CodeReviewResult> {
		try {
			const content = await fs.promises.readFile(filePath, "utf-8")
			const fileExtension = path.extname(filePath).toLowerCase()
			const language = this.supportedLanguages.get(fileExtension)

			if (!language) {
				throw new Error(`Unsupported file type: ${fileExtension}`)
			}

			const issues: CodeIssue[] = []
			const thirdPartyResults: ThirdPartyAnalysisResult[] = []

			// 使用AI进行代码分析
			const aiIssues = await this.performAIAnalysis(content, filePath, language)
			issues.push(...aiIssues)

			// 使用第三方提供商进行分析
			if (options?.enableThirdParty) {
				const providersToUse = options.providers || Array.from(this.thirdPartyProviders.keys())

				for (const providerId of providersToUse) {
					const provider = this.thirdPartyProviders.get(providerId)
					if (provider) {
						try {
							const result = await provider.analyzeFile(filePath, content, options.analysisOptions)
							thirdPartyResults.push(result)
							issues.push(...result.issues)
						} catch (error) {
							console.warn(`Provider ${providerId} analysis failed:`, error)
						}
					}
				}
			}

			// 计算代码指标
			const metrics = this.calculateMetrics(content)

			// 生成汇总信息
			const summary = this.generateSummary(issues)

			return {
				summary,
				issues,
				metrics,
				thirdPartyResults,
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			vscode.window.showErrorMessage(`代码审查失败: ${errorMessage}`)
			throw error
		}
	}

	/**
	 * 分析目录下所有相关文件
	 */
	public async analyzeDirectory(
		dirPath: string,
		includePatterns: string[] = ["**/*.{js,ts,jsx,tsx,py,java,cpp,c,go,rs}"],
		options?: {
			enableThirdParty?: boolean
			providers?: string[]
			analysisOptions?: AnalysisOptions
		},
	): Promise<CodeReviewResult> {
		try {
			const files = await this.findFiles(dirPath, includePatterns)
			const allIssues: CodeIssue[] = []
			const allThirdPartyResults: ThirdPartyAnalysisResult[] = []
			let totalLoc = 0
			let totalComplexity = 0

			for (const file of files) {
				try {
					const result = await this.analyzeFile(file, options)
					allIssues.push(...result.issues)
					if (result.thirdPartyResults) {
						allThirdPartyResults.push(...result.thirdPartyResults)
					}
					totalLoc += result.metrics.linesOfCode
					totalComplexity += result.metrics.complexity
				} catch (error) {
					console.warn(`Failed to analyze file ${file}:`, error)
				}
			}

			const summary = this.generateSummary(allIssues)
			const metrics = {
				linesOfCode: totalLoc,
				complexity: totalComplexity,
				maintainabilityIndex: this.calculateMaintainabilityIndex(totalLoc, totalComplexity, allIssues.length),
			}

			return {
				summary,
				issues: allIssues,
				metrics,
				thirdPartyResults: allThirdPartyResults,
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			vscode.window.showErrorMessage(`目录分析失败: ${errorMessage}`)
			throw error
		}
	}

	/**
	 * 计算代码指标
	 */
	private calculateMetrics(content: string) {
		const lines = content.split("\n")
		const nonEmptyLines = lines.filter((line) => line.trim().length > 0)
		const linesOfCode = nonEmptyLines.length

		// 简单的圈复杂度计算
		let complexity = 1 // 基础复杂度
		const complexityKeywords = ["if", "else", "while", "for", "case", "catch", "&&", "||", "?"]

		content.split(/\s+/).forEach((word) => {
			if (complexityKeywords.includes(word)) {
				complexity++
			}
		})

		// 可维护性指数计算 (简化版)
		const maintainabilityIndex = Math.max(0, 171 - 5.2 * Math.log(linesOfCode) - 0.23 * complexity)

		return {
			linesOfCode,
			complexity,
			maintainabilityIndex: Math.round(maintainabilityIndex),
		}
	}

	/**
	 * 生成汇总信息
	 */
	private generateSummary(issues: CodeIssue[]) {
		return {
			totalIssues: issues.length,
			criticalIssues: issues.filter((i) => i.severity === SeverityLevel.CRITICAL).length,
			highIssues: issues.filter((i) => i.severity === SeverityLevel.HIGH).length,
			mediumIssues: issues.filter((i) => i.severity === SeverityLevel.MEDIUM).length,
			lowIssues: issues.filter((i) => i.severity === SeverityLevel.LOW).length,
		}
	}

	/**
	 * 计算可维护性指数
	 */
	private calculateMaintainabilityIndex(linesOfCode: number, complexity: number, issueCount: number): number {
		// 简化的可维护性指数计算
		const base = 171 - 5.2 * Math.log(linesOfCode) - 0.23 * complexity - 16.2 * Math.log(linesOfCode)
		const penalty = issueCount * 2 // 每个问题扣2分
		return Math.max(0, Math.round(base - penalty))
	}

	/**
	 * 查找符合模式的文件
	 */
	private async findFiles(dirPath: string, patterns: string[]): Promise<string[]> {
		const files: string[] = []

		const scan = async (currentPath: string) => {
			const entries = await fs.promises.readdir(currentPath, { withFileTypes: true })

			for (const entry of entries) {
				const fullPath = path.join(currentPath, entry.name)

				if (entry.isDirectory()) {
					// 跳过node_modules等目录
					if (!["node_modules", ".git", "dist", "build", ".vscode"].includes(entry.name)) {
						await scan(fullPath)
					}
				} else {
					// 检查文件是否匹配模式
					const extension = path.extname(entry.name).toLowerCase()
					const supportedExtensions = [".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".cpp", ".c", ".go", ".rs"]

					if (supportedExtensions.includes(extension)) {
						files.push(fullPath)
					}
				}
			}
		}

		await scan(dirPath)
		return files
	}

	private async performAIAnalysis(content: string, filePath: string, language: SupportedLanguage): Promise<CodeIssue[]> {
		try {
			const systemPrompt = `你是一个专业的代码审查专家。请分析以下${language.name}代码，找出潜在的问题，包括：
1. 代码质量问题
2. 安全漏洞
3. 性能问题
4. 可维护性问题
5. 最佳实践违规

请以JSON格式返回分析结果，格式如下：
{
    "issues": [
        {
            "type": "quality|security|performance|style|bug",
            "severity": "low|medium|high|critical",
            "message": "问题描述",
            "line": 行号,
            "suggestion": "改进建议"
        }
    ]
}`

			const stream = this.apiHandler.createMessage(systemPrompt, [
				{
					role: "user",
					content: content,
				},
			] as Anthropic.Messages.MessageParam[])

			let response = ""
			for await (const chunk of stream) {
				response += chunk
			}

			try {
				const result = JSON.parse(response)
				if (result.issues && Array.isArray(result.issues)) {
					return result.issues.map((issue: any) => ({
						...issue,
						type: this.mapLegacyType(issue.type),
						severity: this.mapLegacySeverity(issue.severity),
						file: filePath,
						source: "AI",
					}))
				}
			} catch (e) {
				console.error("Failed to parse AI response:", e)
			}
		} catch (error) {
			console.error("AI analysis failed:", error)
		}

		return []
	}

	private mapLegacyType(legacyType: string): CodeReviewType {
		const mapping: Record<string, CodeReviewType> = {
			quality: CodeReviewType.QUALITY,
			security: CodeReviewType.SECURITY,
			performance: CodeReviewType.PERFORMANCE,
			style: CodeReviewType.STYLE,
			bug: CodeReviewType.BUG,
		}
		return mapping[legacyType] || CodeReviewType.QUALITY
	}

	private mapLegacySeverity(legacySeverity: string): SeverityLevel {
		const mapping: Record<string, SeverityLevel> = {
			low: SeverityLevel.LOW,
			medium: SeverityLevel.MEDIUM,
			high: SeverityLevel.HIGH,
			critical: SeverityLevel.CRITICAL,
		}
		return mapping[legacySeverity] || SeverityLevel.MEDIUM
	}
}
