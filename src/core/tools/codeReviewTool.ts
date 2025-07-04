import { ToolDefinition } from "@core/prompts/model_prompts/jsonToolToXml"
import {
	CodeReviewService,
	CodeReviewResult,
	CodeIssue,
	ThirdPartyCodeReviewProvider,
	ThirdPartyProviderConfig,
	AnalysisOptions,
	CodeReviewType,
	SeverityLevel,
} from "../../services/code-review/CodeReviewService"
import { ApiConfiguration } from "../../shared/api"
import * as path from "path"
import * as vscode from "vscode"
import { ApiProvider } from "../../shared/api"

// 导出事件名称常量
export const CODE_REVIEW_EVENTS = {
	START: "code-review-start",
	COMPLETE: "code-review-complete",
	ERROR: "code-review-error",
	THIRD_PARTY_STATUS: "third-party-status",
}

// 获取活动的webview面板
function getActiveWebview() {
	const panel = vscode.window.activeTextEditor?.document.uri
	if (panel) {
		return vscode.window.visibleTextEditors.find((editor) => editor.document.uri.toString() === panel.toString())
	}
	return undefined
}

// 发送消息到webview
function postMessageToWebview(type: string, payload: any) {
	const webview = getActiveWebview()
	if (webview) {
		vscode.commands.executeCommand("cline.postMessageToWebview", {
			type,
			payload,
		})
	}
}

export const codeReviewToolDefinition: ToolDefinition = {
	name: "CodeReview",
	descriptionForAgent: `Perform comprehensive code review analysis on files or directories using AI and third-party providers. This tool analyzes code quality, security vulnerabilities, performance issues, and coding style problems. It provides detailed reports with severity levels and actionable suggestions for improvement.

Features:
- AI-powered code analysis using language models
- Integration with third-party code review providers (SonarQube, CodeClimate, etc.)
- Code quality analysis (complexity, maintainability, technical debt)
- Security vulnerability detection (hardcoded secrets, SQL injection, XSS)
- Performance optimization suggestions (sync operations, DOM queries)
- Code style consistency checks (indentation, trailing whitespace)
- Comprehensive metrics (lines of code, complexity, maintainability index)
- Batch analysis for multiple files and directories
- Configurable analysis options and severity filtering

Supported Third-Party Providers:
- SonarQube: Comprehensive static analysis
- CodeClimate: Maintainability and quality metrics
- ESLint/TSLint: JavaScript/TypeScript linting
- Custom providers via standard interface

Use this tool when:
- Reviewing code before deployment
- Identifying potential security vulnerabilities
- Optimizing code performance
- Maintaining code quality standards
- Onboarding new team members to code standards
- Setting up CI/CD quality gates`,
	inputSchema: {
		type: "object",
		properties: {
			target_path: {
				type: "string",
				description: "The file or directory path to analyze (relative to current working directory)",
			},
			analysis_type: {
				type: "string",
				enum: ["file", "directory"],
				description: "Whether to analyze a single file or entire directory",
				default: "file",
			},
			include_patterns: {
				type: "array",
				items: {
					type: "string",
				},
				description: "File patterns to include when analyzing directories (e.g., ['*.js', '*.ts'])",
				default: ["*.js", "*.ts", "*.jsx", "*.tsx", "*.py", "*.java", "*.cpp", "*.c", "*.go", "*.rs"],
			},
			severity_filter: {
				type: "string",
				enum: ["all", "critical", "high", "medium", "low", "info"],
				description: "Filter issues by minimum severity level",
				default: "all",
			},
			issue_types: {
				type: "array",
				items: {
					type: "string",
					enum: ["quality", "security", "performance", "style", "bug", "maintainability"],
				},
				description: "Types of issues to check for",
				default: ["quality", "security", "performance", "style"],
			},
			enable_third_party: {
				type: "boolean",
				description: "Enable third-party code review providers",
				default: false,
			},
			third_party_providers: {
				type: "array",
				items: {
					type: "string",
				},
				description: "Specific third-party providers to use (if not specified, all configured providers will be used)",
			},
			analysis_options: {
				type: "object",
				description: "Advanced analysis configuration options",
				properties: {
					language_specific: {
						type: "object",
						description: "Language-specific analysis options",
					},
					exclude_rules: {
						type: "array",
						items: { type: "string" },
						description: "Rule IDs to exclude from analysis",
					},
					custom_rules: {
						type: "array",
						description: "Custom rules to apply during analysis",
					},
				},
			},
			detailed_report: {
				type: "boolean",
				description: "Generate detailed report with suggestions and statistics",
				default: true,
			},
		},
		required: ["target_path"],
	},
}

// 工具执行函数
export async function executeCodeReview(
	targetPath: string,
	cwd: string,
	analysisType: "file" | "directory" = "file",
	includePatterns: string[] = ["*.js", "*.ts", "*.jsx", "*.tsx", "*.py", "*.java", "*.cpp", "*.c", "*.go", "*.rs"],
	severityFilter: "all" | "critical" | "high" | "medium" | "low" | "info" = "all",
	issueTypes: ("quality" | "security" | "performance" | "style" | "bug" | "maintainability")[] = [
		"quality",
		"security",
		"performance",
		"style",
	],
	enableThirdParty: boolean = false,
	detailedReport: boolean = true,
	thirdPartyProviders?: string[],
	analysisOptions?: any,
): Promise<string> {
	try {
		// 发送开始事件
		postMessageToWebview(CODE_REVIEW_EVENTS.START, {
			targetPath,
			analysisType,
			enableThirdParty,
			providers: thirdPartyProviders,
		})

		const extension = vscode.extensions.getExtension("rikaaa0928.riklina")
		if (!extension) {
			throw new Error("Riklina extension not found")
		}

		await extension.activate()
		const extensionState = await extension.exports.getStateToPostToWebview()
		if (!extensionState?.apiConfiguration) {
			throw new Error("API configuration not found. Please configure your API settings in Riklina.")
		}

		const effectiveApiConfiguration: ApiConfiguration = {
			...extensionState.apiConfiguration,
			taskId: Date.now().toString(),
		}

		const service = CodeReviewService.getInstance(effectiveApiConfiguration)

		// 配置第三方提供商（如果启用）
		if (enableThirdParty) {
			await configureThirdPartyProviders(service)
		}

		const fullPath = path.resolve(cwd, targetPath)

		// 构建分析选项
		const reviewOptions = {
			enableThirdParty,
			providers: thirdPartyProviders,
			analysisOptions: {
				reviewTypes: issueTypes.map(mapLegacyIssueType),
				severityFilter: severityFilter === "all" ? undefined : [mapLegacySeverity(severityFilter)],
				languageSpecific: analysisOptions?.language_specific,
				excludeRules: analysisOptions?.exclude_rules,
				customRules: analysisOptions?.custom_rules,
			} as AnalysisOptions,
		}

		let result: CodeReviewResult

		if (analysisType === "file") {
			result = await service.analyzeFile(fullPath, reviewOptions)
		} else {
			result = await service.analyzeDirectory(fullPath, includePatterns, reviewOptions)
		}

		// 过滤结果
		const filteredIssues = filterIssues(result.issues, severityFilter, issueTypes)
		const filteredResult = {
			...result,
			issues: filteredIssues,
			summary: {
				...result.summary,
				totalIssues: filteredIssues.length,
				criticalIssues: filteredIssues.filter((i) => i.severity === SeverityLevel.CRITICAL).length,
				highIssues: filteredIssues.filter((i) => i.severity === SeverityLevel.HIGH).length,
				mediumIssues: filteredIssues.filter((i) => i.severity === SeverityLevel.MEDIUM).length,
				lowIssues: filteredIssues.filter((i) => i.severity === SeverityLevel.LOW).length,
			},
		}

		const report = detailedReport
			? formatDetailedCodeReviewReport(filteredResult, targetPath, analysisType, enableThirdParty)
			: formatSummaryCodeReviewReport(filteredResult, targetPath, analysisType)

		// 发送完成事件
		postMessageToWebview(CODE_REVIEW_EVENTS.COMPLETE, {
			targetPath,
			summary: filteredResult.summary,
			thirdPartyUsed: enableThirdParty,
			providersUsed: thirdPartyProviders,
		})

		return report
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		// 发送错误事件
		postMessageToWebview(CODE_REVIEW_EVENTS.ERROR, { targetPath, error: errorMessage })
		return `代码审查失败: ${errorMessage}\n\n建议检查：\n1. 文件路径是否正确\n2. API配置是否有效\n3. 第三方服务是否可用（如果启用）\n4. 网络连接是否正常`
	}
}

// 配置第三方提供商
async function configureThirdPartyProviders(service: CodeReviewService): Promise<void> {
	// 从VSCode配置中读取第三方提供商配置
	const config = vscode.workspace.getConfiguration("codeReview")

	// SonarQube配置示例
	const sonarQubeConfig = config.get<any>("sonarqube")
	if (sonarQubeConfig?.enabled) {
		try {
			await service.configureProvider("sonarqube", {
				apiKey: sonarQubeConfig.apiKey,
				endpoint: sonarQubeConfig.endpoint,
				timeout: sonarQubeConfig.timeout || 30000,
				retryAttempts: sonarQubeConfig.retryAttempts || 3,
				customHeaders: sonarQubeConfig.customHeaders,
			} as ThirdPartyProviderConfig)

			postMessageToWebview(CODE_REVIEW_EVENTS.THIRD_PARTY_STATUS, {
				provider: "sonarqube",
				status: "configured",
			})
		} catch (error) {
			console.warn("Failed to configure SonarQube provider:", error)
			postMessageToWebview(CODE_REVIEW_EVENTS.THIRD_PARTY_STATUS, {
				provider: "sonarqube",
				status: "failed",
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	// 可以添加更多第三方提供商的配置
}

// 映射旧版问题类型到新枚举
function mapLegacyIssueType(legacyType: string): CodeReviewType {
	const mapping: Record<string, CodeReviewType> = {
		quality: CodeReviewType.QUALITY,
		security: CodeReviewType.SECURITY,
		performance: CodeReviewType.PERFORMANCE,
		style: CodeReviewType.STYLE,
		bug: CodeReviewType.BUG,
		maintainability: CodeReviewType.MAINTAINABILITY,
	}
	return mapping[legacyType] || CodeReviewType.QUALITY
}

// 映射旧版严重程度到新枚举
function mapLegacySeverity(legacySeverity: string): SeverityLevel {
	const mapping: Record<string, SeverityLevel> = {
		critical: SeverityLevel.CRITICAL,
		high: SeverityLevel.HIGH,
		medium: SeverityLevel.MEDIUM,
		low: SeverityLevel.LOW,
		info: SeverityLevel.INFO,
	}
	return mapping[legacySeverity] || SeverityLevel.MEDIUM
}

// 过滤问题函数
function filterIssues(issues: CodeIssue[], severityFilter: string, issueTypes: string[]): CodeIssue[] {
	const mappedIssueTypes = issueTypes.map(mapLegacyIssueType)
	let filtered = issues.filter((issue) => mappedIssueTypes.includes(issue.type))

	if (severityFilter !== "all") {
		const severityLevels = [
			SeverityLevel.INFO,
			SeverityLevel.LOW,
			SeverityLevel.MEDIUM,
			SeverityLevel.HIGH,
			SeverityLevel.CRITICAL,
		]
		const minLevel = severityLevels.indexOf(mapLegacySeverity(severityFilter))
		filtered = filtered.filter((issue) => severityLevels.indexOf(issue.severity) >= minLevel)
	}

	return filtered
}

// 格式化详细报告函数
function formatDetailedCodeReviewReport(
	result: CodeReviewResult,
	targetPath: string,
	analysisType: "file" | "directory",
	enableThirdParty: boolean = false,
): string {
	const { summary, issues, metrics, thirdPartyResults } = result

	let report = `# 🔍 代码审查详细报告\n\n`
	report += `**分析目标**: ${targetPath} (${analysisType === "file" ? "文件" : "目录"})\n`
	report += `**分析时间**: ${new Date().toLocaleString("zh-CN")}\n`
	report += `**第三方分析**: ${enableThirdParty ? "启用" : "禁用"}\n\n`

	// 第三方提供商状态
	if (enableThirdParty && thirdPartyResults && thirdPartyResults.length > 0) {
		report += `## 🔌 第三方分析提供商\n\n`
		thirdPartyResults.forEach((result) => {
			report += `### ${result.providerId}\n`
			report += `- **版本**: ${result.providerVersion}\n`
			report += `- **分析ID**: ${result.analysisId}\n`
			report += `- **处理时间**: ${result.processingTime}ms\n`
			report += `- **发现问题**: ${result.issues.length}个\n\n`
		})
	}

	// 汇总信息
	report += `## 📊 汇总信息\n\n`
	report += `| 指标 | 数值 |\n`
	report += `|------|------|\n`
	report += `| 代码行数 | ${metrics.linesOfCode} |\n`
	report += `| 圈复杂度 | ${metrics.complexity} |\n`
	report += `| 可维护性指数 | ${metrics.maintainabilityIndex}/100 |\n`
	report += `| 总问题数 | ${summary.totalIssues} |\n`
	report += `| 🔴 严重问题 | ${summary.criticalIssues} |\n`
	report += `| 🟠 高优先级 | ${summary.highIssues} |\n`
	report += `| 🟡 中等优先级 | ${summary.mediumIssues} |\n`
	report += `| 🔵 低优先级 | ${summary.lowIssues} |\n\n`

	// 质量评估
	const qualityGrade = getQualityGrade(metrics.maintainabilityIndex, summary.totalIssues)
	report += `## 🎯 质量评估\n\n`
	report += `**整体评级**: ${qualityGrade.grade} ${qualityGrade.emoji}\n\n`
	report += `${qualityGrade.description}\n\n`

	// 按严重程度分组显示问题
	if (issues.length > 0) {
		report += `## 🚨 发现的问题\n\n`

		const severityLevels = [
			{ level: SeverityLevel.CRITICAL, emoji: "🔴", name: "严重问题" },
			{ level: SeverityLevel.HIGH, emoji: "🟠", name: "高优先级" },
			{ level: SeverityLevel.MEDIUM, emoji: "🟡", name: "中等优先级" },
			{ level: SeverityLevel.LOW, emoji: "🔵", name: "低优先级" },
			{ level: SeverityLevel.INFO, emoji: "ℹ️", name: "信息提示" },
		] as const

		severityLevels.forEach(({ level, emoji, name }) => {
			const severityIssues = issues.filter((issue) => issue.severity === level)
			if (severityIssues.length > 0) {
				report += `### ${emoji} ${name} (${severityIssues.length}个)\n\n`

				severityIssues.forEach((issue, index) => {
					report += `#### ${index + 1}. ${getIssueTypeEmoji(issue.type)} ${issue.message}\n\n`
					report += `**文件**: \`${issue.file}\`  \n`
					report += `**位置**: 第 ${issue.line} 行${issue.column ? ` 第 ${issue.column} 列` : ""}\n\n`
					if (issue.description) {
						report += `**详细描述**: ${issue.description}\n\n`
					}
					if (issue.suggestion) {
						report += `**建议**: ${issue.suggestion}\n\n`
					}
					if (issue.ruleId) {
						report += `**规则ID**: \`${issue.ruleId}\`\n\n`
					}
					if (issue.source) {
						report += `**来源**: ${issue.source}\n\n`
					}
					if (issue.fixes && issue.fixes.length > 0) {
						report += `**修复建议**:\n`
						issue.fixes.forEach((fix, fixIndex) => {
							report += `${fixIndex + 1}. ${fix.description}\n`
						})
						report += `\n`
					}
					report += `---\n\n`
				})
			}
		})
	} else {
		report += `## ✅ 太棒了！没有发现任何问题\n\n`
		report += `代码质量良好，符合最佳实践标准。\n\n`
	}

	// 改进建议
	if (issues.length > 0) {
		report += `## 💡 改进建议\n\n`
		const suggestions = generateImprovementSuggestions(result)
		suggestions.forEach((suggestion, index) => {
			report += `${index + 1}. ${suggestion}\n`
		})
		report += `\n`
	}

	// 统计信息
	report += `## 📈 详细统计\n\n`
	const issuesByType = groupIssuesByType(issues)
	Object.entries(issuesByType).forEach(([type, count]) => {
		const emoji = getIssueTypeEmoji(type as CodeReviewType)
		const typeName = getIssueTypeName(type as CodeReviewType)
		report += `- ${emoji} ${typeName}: ${count}个\n`
	})

	return report
}

// 格式化简要报告函数
function formatSummaryCodeReviewReport(result: CodeReviewResult, targetPath: string, analysisType: "file" | "directory"): string {
	const { summary, metrics } = result

	let report = `# 📋 代码审查简要报告\n\n`
	report += `**目标**: ${targetPath} (${analysisType === "file" ? "文件" : "目录"})\n`
	report += `**时间**: ${new Date().toLocaleString("zh-CN")}\n\n`

	// 核心指标
	report += `## 核心指标\n\n`
	report += `- 📏 代码行数: ${metrics.linesOfCode}\n`
	report += `- 🔄 复杂度: ${metrics.complexity}\n`
	report += `- 🎯 可维护性: ${metrics.maintainabilityIndex}/100\n`
	report += `- ⚠️ 问题总数: ${summary.totalIssues}\n\n`

	// 问题分布
	if (summary.totalIssues > 0) {
		report += `## 问题分布\n\n`
		if (summary.criticalIssues > 0) {
			report += `🔴 严重: ${summary.criticalIssues}\n`
		}
		if (summary.highIssues > 0) {
			report += `🟠 高: ${summary.highIssues}\n`
		}
		if (summary.mediumIssues > 0) {
			report += `🟡 中: ${summary.mediumIssues}\n`
		}
		if (summary.lowIssues > 0) {
			report += `🔵 低: ${summary.lowIssues}\n`
		}
	} else {
		report += `## ✅ 状态良好\n\n未发现代码质量问题。\n`
	}

	return report
}

// 获取质量评级
function getQualityGrade(maintainabilityIndex: number, totalIssues: number) {
	if (maintainabilityIndex >= 80 && totalIssues === 0) {
		return {
			grade: "A+",
			emoji: "🌟",
			description: "优秀！代码质量非常高，可维护性极佳，没有发现任何问题。",
		}
	} else if (maintainabilityIndex >= 70 && totalIssues <= 5) {
		return {
			grade: "A",
			emoji: "✨",
			description: "很好！代码质量高，可维护性良好，只有少量小问题。",
		}
	} else if (maintainabilityIndex >= 60 && totalIssues <= 15) {
		return {
			grade: "B",
			emoji: "👍",
			description: "良好！代码质量不错，但还有改进空间。",
		}
	} else if (maintainabilityIndex >= 40 && totalIssues <= 30) {
		return {
			grade: "C",
			emoji: "⚠️",
			description: "一般！代码需要重构以提高质量和可维护性。",
		}
	} else {
		return {
			grade: "D",
			emoji: "🚨",
			description: "需要关注！代码质量较低，建议优先解决关键问题。",
		}
	}
}

// 获取问题类型emoji
function getIssueTypeEmoji(type: CodeReviewType): string {
	const emojis: Record<CodeReviewType, string> = {
		[CodeReviewType.QUALITY]: "🔧",
		[CodeReviewType.SECURITY]: "🛡️",
		[CodeReviewType.PERFORMANCE]: "⚡",
		[CodeReviewType.STYLE]: "🎨",
		[CodeReviewType.BUG]: "🐛",
		[CodeReviewType.MAINTAINABILITY]: "🛠️",
	}
	return emojis[type] || "❓"
}

// 获取问题类型名称
function getIssueTypeName(type: CodeReviewType): string {
	const names: Record<CodeReviewType, string> = {
		[CodeReviewType.QUALITY]: "代码质量",
		[CodeReviewType.SECURITY]: "安全问题",
		[CodeReviewType.PERFORMANCE]: "性能问题",
		[CodeReviewType.STYLE]: "代码风格",
		[CodeReviewType.BUG]: "潜在错误",
		[CodeReviewType.MAINTAINABILITY]: "可维护性",
	}
	return names[type] || "未知类型"
}

// 按类型分组问题
function groupIssuesByType(issues: CodeIssue[]): Record<string, number> {
	const groups: Record<string, number> = {}
	issues.forEach((issue) => {
		groups[issue.type] = (groups[issue.type] || 0) + 1
	})
	return groups
}

// 生成改进建议
function generateImprovementSuggestions(result: CodeReviewResult): string[] {
	const suggestions: string[] = []
	const { summary, metrics } = result

	if (summary.criticalIssues > 0) {
		suggestions.push("🔴 **优先处理严重问题**：立即修复所有严重安全漏洞和关键质量问题")
	}

	if (summary.highIssues > 0) {
		suggestions.push("🟠 **解决高优先级问题**：尽快修复高优先级的性能和安全问题")
	}

	if (metrics.complexity > 20) {
		suggestions.push("🔄 **降低复杂度**：将复杂的函数拆分为更小的函数以提高可读性")
	}

	if (metrics.maintainabilityIndex < 60) {
		suggestions.push("🛠️ **提高可维护性**：重构代码结构，添加注释和文档")
	}

	const securityIssues = result.issues.filter((i) => i.type === CodeReviewType.SECURITY).length
	if (securityIssues > 0) {
		suggestions.push("🛡️ **加强安全性**：修复所有安全漏洞，建立安全编码规范")
	}

	const performanceIssues = result.issues.filter((i) => i.type === CodeReviewType.PERFORMANCE).length
	if (performanceIssues > 0) {
		suggestions.push("⚡ **优化性能**：解决同步操作和低效循环等性能问题")
	}

	if (summary.totalIssues > 50) {
		suggestions.push("📋 **分阶段改进**：问题较多，建议分批次修复，优先处理高影响问题")
	}

	return suggestions
}
