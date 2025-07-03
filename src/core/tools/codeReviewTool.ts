import { ToolDefinition } from "@core/prompts/model_prompts/jsonToolToXml"
import { CodeReviewService, CodeReviewResult, CodeIssue } from "../../services/code-review/CodeReviewService"
import * as path from "path"
import * as vscode from "vscode"

// 导出事件名称常量
export const CODE_REVIEW_EVENTS = {
	START: "code-review-start",
	COMPLETE: "code-review-complete",
	ERROR: "code-review-error",
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
	descriptionForAgent: `Perform comprehensive code review analysis on files or directories. This tool analyzes code quality, security vulnerabilities, performance issues, and coding style problems. It provides detailed reports with severity levels and actionable suggestions for improvement.

Features:
- Code quality analysis (complexity, maintainability, technical debt)
- Security vulnerability detection (hardcoded secrets, SQL injection, XSS)
- Performance optimization suggestions (sync operations, DOM queries)
- Code style consistency checks (indentation, trailing whitespace)
- Comprehensive metrics (lines of code, complexity, maintainability index)

Use this tool when:
- Reviewing code before deployment
- Identifying potential security vulnerabilities
- Optimizing code performance
- Maintaining code quality standards
- Onboarding new team members to code standards`,
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
				enum: ["all", "critical", "high", "medium", "low"],
				description: "Filter issues by minimum severity level",
				default: "all",
			},
			issue_types: {
				type: "array",
				items: {
					type: "string",
					enum: ["quality", "security", "performance", "style", "bug"],
				},
				description: "Types of issues to check for",
				default: ["quality", "security", "performance", "style"],
			},
		},
		required: ["target_path"],
	},
}

// 工具执行函数
export async function executeCodeReview(
	targetPath: string,
	analysisType: "file" | "directory" = "file",
	includePatterns: string[] = ["*.js", "*.ts", "*.jsx", "*.tsx", "*.py", "*.java", "*.cpp", "*.c", "*.go", "*.rs"],
	severityFilter: "all" | "critical" | "high" | "medium" | "low" = "all",
	issueTypes: ("quality" | "security" | "performance" | "style" | "bug")[] = ["quality", "security", "performance", "style"],
	cwd: string,
): Promise<string> {
	try {
		// 发送开始事件
		postMessageToWebview(CODE_REVIEW_EVENTS.START, targetPath)

		const service = CodeReviewService.getInstance()
		const fullPath = path.resolve(cwd, targetPath)

		let result: CodeReviewResult

		if (analysisType === "file") {
			result = await service.analyzeFile(fullPath)
		} else {
			result = await service.analyzeDirectory(fullPath, includePatterns)
		}

		// 过滤结果
		const filteredIssues = filterIssues(result.issues, severityFilter, issueTypes)
		const filteredResult = {
			...result,
			issues: filteredIssues,
			summary: {
				...result.summary,
				totalIssues: filteredIssues.length,
				criticalIssues: filteredIssues.filter((i) => i.severity === "critical").length,
				highIssues: filteredIssues.filter((i) => i.severity === "high").length,
				mediumIssues: filteredIssues.filter((i) => i.severity === "medium").length,
				lowIssues: filteredIssues.filter((i) => i.severity === "low").length,
			},
		}

		const report = formatCodeReviewReport(filteredResult, targetPath, analysisType)

		// 发送完成事件
		postMessageToWebview(CODE_REVIEW_EVENTS.COMPLETE, targetPath)

		return report
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		// 发送错误事件
		postMessageToWebview(CODE_REVIEW_EVENTS.ERROR, errorMessage)
		return `代码审查失败: ${errorMessage}`
	}
}

// 过滤问题函数
function filterIssues(issues: CodeIssue[], severityFilter: string, issueTypes: string[]): CodeIssue[] {
	let filtered = issues.filter((issue) => issueTypes.includes(issue.type))

	if (severityFilter !== "all") {
		const severityLevels = ["low", "medium", "high", "critical"]
		const minLevel = severityLevels.indexOf(severityFilter)
		filtered = filtered.filter((issue) => severityLevels.indexOf(issue.severity) >= minLevel)
	}

	return filtered
}

// 格式化报告函数
function formatCodeReviewReport(result: CodeReviewResult, targetPath: string, analysisType: "file" | "directory"): string {
	const { summary, issues, metrics } = result

	let report = `# 🔍 代码审查报告\n\n`
	report += `**分析目标**: ${targetPath} (${analysisType === "file" ? "文件" : "目录"})\n`
	report += `**分析时间**: ${new Date().toLocaleString("zh-CN")}\n\n`

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
			{ level: "critical", emoji: "🔴", name: "严重问题" },
			{ level: "high", emoji: "🟠", name: "高优先级" },
			{ level: "medium", emoji: "🟡", name: "中等优先级" },
			{ level: "low", emoji: "🔵", name: "低优先级" },
		] as const

		severityLevels.forEach(({ level, emoji, name }) => {
			const severityIssues = issues.filter((issue) => issue.severity === level)
			if (severityIssues.length > 0) {
				report += `### ${emoji} ${name} (${severityIssues.length}个)\n\n`

				severityIssues.forEach((issue, index) => {
					report += `#### ${index + 1}. ${getIssueTypeEmoji(issue.type)} ${issue.message}\n\n`
					report += `**文件**: \`${issue.file}\`  \n`
					report += `**位置**: 第 ${issue.line} 行\n\n`
					if (issue.suggestion) {
						report += `**建议**: ${issue.suggestion}\n\n`
					}
					if (issue.ruleId) {
						report += `**规则ID**: \`${issue.ruleId}\`\n\n`
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
		const emoji = getIssueTypeEmoji(type as any)
		const typeName = getIssueTypeName(type as any)
		report += `- ${emoji} ${typeName}: ${count}个\n`
	})

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
function getIssueTypeEmoji(type: string): string {
	const emojis: Record<string, string> = {
		quality: "🔧",
		security: "🛡️",
		performance: "⚡",
		style: "🎨",
		bug: "🐛",
	}
	return emojis[type] || "❓"
}

// 获取问题类型名称
function getIssueTypeName(type: string): string {
	const names: Record<string, string> = {
		quality: "代码质量",
		security: "安全问题",
		performance: "性能问题",
		style: "代码风格",
		bug: "潜在错误",
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

	const securityIssues = result.issues.filter((i) => i.type === "security").length
	if (securityIssues > 0) {
		suggestions.push("🛡️ **加强安全性**：修复所有安全漏洞，建立安全编码规范")
	}

	const performanceIssues = result.issues.filter((i) => i.type === "performance").length
	if (performanceIssues > 0) {
		suggestions.push("⚡ **优化性能**：解决同步操作和低效循环等性能问题")
	}

	if (summary.totalIssues > 50) {
		suggestions.push("📋 **分阶段改进**：问题较多，建议分批次修复，优先处理高影响问题")
	}

	return suggestions
}
