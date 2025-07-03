import * as vscode from "vscode"
import * as fs from "fs"
import * as path from "path"

export interface CodeIssue {
	type: "quality" | "security" | "performance" | "style" | "bug"
	severity: "low" | "medium" | "high" | "critical"
	message: string
	file: string
	line: number
	column?: number
	suggestion?: string
	ruleId?: string
}

export interface CodeReviewResult {
	summary: {
		totalIssues: number
		criticalIssues: number
		highIssues: number
		mediumIssues: number
		lowIssues: number
		coverage?: number
	}
	issues: CodeIssue[]
	metrics: {
		linesOfCode: number
		complexity: number
		maintainabilityIndex: number
		testCoverage?: number
	}
}

export class CodeReviewService {
	private static instance: CodeReviewService

	public static getInstance(): CodeReviewService {
		if (!CodeReviewService.instance) {
			CodeReviewService.instance = new CodeReviewService()
		}
		return CodeReviewService.instance
	}

	/**
	 * 分析指定文件的代码质量
	 */
	public async analyzeFile(filePath: string): Promise<CodeReviewResult> {
		try {
			const content = await fs.promises.readFile(filePath, "utf-8")
			const fileExtension = path.extname(filePath).toLowerCase()

			const issues: CodeIssue[] = []

			// 基础代码质量检查
			issues.push(...this.checkCodeQuality(content, filePath, fileExtension))

			// 安全漏洞检查
			issues.push(...this.checkSecurity(content, filePath, fileExtension))

			// 性能问题检查
			issues.push(...this.checkPerformance(content, filePath, fileExtension))

			// 代码风格检查
			issues.push(...this.checkCodeStyle(content, filePath, fileExtension))

			// 计算代码指标
			const metrics = this.calculateMetrics(content, fileExtension)

			// 生成汇总信息
			const summary = this.generateSummary(issues)

			return {
				summary,
				issues,
				metrics,
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
	): Promise<CodeReviewResult> {
		try {
			const files = await this.findFiles(dirPath, includePatterns)
			const allIssues: CodeIssue[] = []
			let totalLoc = 0
			let totalComplexity = 0

			for (const file of files) {
				try {
					const result = await this.analyzeFile(file)
					allIssues.push(...result.issues)
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
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			vscode.window.showErrorMessage(`目录分析失败: ${errorMessage}`)
			throw error
		}
	}

	/**
	 * 代码质量检查
	 */
	private checkCodeQuality(content: string, filePath: string, fileExtension: string): CodeIssue[] {
		const issues: CodeIssue[] = []
		const lines = content.split("\n")

		lines.forEach((line, index) => {
			const lineNumber = index + 1
			const trimmedLine = line.trim()

			// 检查过长的行
			if (line.length > 120) {
				issues.push({
					type: "quality",
					severity: "low",
					message: `Line too long (${line.length} characters). Consider breaking it down.`,
					file: filePath,
					line: lineNumber,
					suggestion: "Break long lines into multiple lines for better readability",
					ruleId: "line-length",
				})
			}

			// 检查TODO/FIXME/HACK注释
			if (trimmedLine.includes("TODO") || trimmedLine.includes("FIXME") || trimmedLine.includes("HACK")) {
				issues.push({
					type: "quality",
					severity: "medium",
					message: "Found TODO/FIXME/HACK comment. Consider addressing this technical debt.",
					file: filePath,
					line: lineNumber,
					suggestion: "Address the technical debt mentioned in the comment",
					ruleId: "technical-debt",
				})
			}

			// 检查复杂的嵌套
			const indentLevel = (line.match(/^[\t\s]*/)?.[0]?.length ?? 0) / 2
			if (indentLevel > 6) {
				issues.push({
					type: "quality",
					severity: "high",
					message: "Deep nesting detected. Consider refactoring to reduce complexity.",
					file: filePath,
					line: lineNumber,
					suggestion: "Extract nested logic into separate functions",
					ruleId: "deep-nesting",
				})
			}

			// JavaScript/TypeScript特定检查
			if ([".js", ".ts", ".jsx", ".tsx"].includes(fileExtension)) {
				// 检查console.log
				if (trimmedLine.includes("console.log")) {
					issues.push({
						type: "quality",
						severity: "low",
						message: "Console.log statement found. Remove debug statements before production.",
						file: filePath,
						line: lineNumber,
						suggestion: "Use proper logging library or remove debug statements",
						ruleId: "console-log",
					})
				}

				// 检查魔法数字
				const magicNumberPattern = /(?<![a-zA-Z_$])\d{2,}(?![a-zA-Z_$])/g
				if (magicNumberPattern.test(trimmedLine) && !trimmedLine.includes("const") && !trimmedLine.includes("let")) {
					issues.push({
						type: "quality",
						severity: "medium",
						message: "Magic number detected. Consider using named constants.",
						file: filePath,
						line: lineNumber,
						suggestion: "Define constants for magic numbers to improve readability",
						ruleId: "magic-numbers",
					})
				}
			}
		})

		return issues
	}

	/**
	 * 安全漏洞检查
	 */
	private checkSecurity(content: string, filePath: string, fileExtension: string): CodeIssue[] {
		const issues: CodeIssue[] = []
		const lines = content.split("\n")

		lines.forEach((line, index) => {
			const lineNumber = index + 1
			const trimmedLine = line.trim()

			// 硬编码密码/密钥检查
			const secretPatterns = [
				/password\s*=\s*["'][\w\d@#$%^&*()_+\-=\[\]{}|\\:";'<>?,./]+["']/i,
				/api[_-]?key\s*=\s*["'][\w\d\-_]+["']/i,
				/secret\s*=\s*["'][\w\d\-_]+["']/i,
				/token\s*=\s*["'][\w\d\-_\.]+["']/i,
			]

			secretPatterns.forEach((pattern) => {
				if (pattern.test(trimmedLine)) {
					issues.push({
						type: "security",
						severity: "critical",
						message: "Hardcoded secret detected. Secrets should be stored in environment variables.",
						file: filePath,
						line: lineNumber,
						suggestion: "Move secrets to environment variables or secure configuration",
						ruleId: "hardcoded-secrets",
					})
				}
			})

			// SQL注入风险检查
			if (trimmedLine.includes("query") && trimmedLine.includes("+")) {
				issues.push({
					type: "security",
					severity: "high",
					message: "Potential SQL injection vulnerability. Use parameterized queries.",
					file: filePath,
					line: lineNumber,
					suggestion: "Use parameterized queries or ORM to prevent SQL injection",
					ruleId: "sql-injection",
				})
			}

			// XSS风险检查 (Web相关)
			if ([".js", ".ts", ".jsx", ".tsx", ".html"].includes(fileExtension)) {
				if (trimmedLine.includes("innerHTML") && !trimmedLine.includes("textContent")) {
					issues.push({
						type: "security",
						severity: "high",
						message: "Potential XSS vulnerability. Avoid using innerHTML with user data.",
						file: filePath,
						line: lineNumber,
						suggestion: "Use textContent or properly sanitize HTML content",
						ruleId: "xss-vulnerability",
					})
				}
			}

			// 不安全的随机数生成
			if (
				trimmedLine.includes("Math.random()") &&
				(trimmedLine.includes("crypto") || trimmedLine.includes("password") || trimmedLine.includes("token"))
			) {
				issues.push({
					type: "security",
					severity: "high",
					message:
						"Math.random() is not cryptographically secure. Use crypto.randomBytes() for security-related randomness.",
					file: filePath,
					line: lineNumber,
					suggestion: "Use crypto.randomBytes() or crypto.getRandomValues() for secure randomness",
					ruleId: "insecure-random",
				})
			}
		})

		return issues
	}

	/**
	 * 性能问题检查
	 */
	private checkPerformance(content: string, filePath: string, fileExtension: string): CodeIssue[] {
		const issues: CodeIssue[] = []
		const lines = content.split("\n")

		lines.forEach((line, index) => {
			const lineNumber = index + 1
			const trimmedLine = line.trim()

			// JavaScript/TypeScript性能检查
			if ([".js", ".ts", ".jsx", ".tsx"].includes(fileExtension)) {
				// 检查同步文件操作
				if (trimmedLine.includes("readFileSync") || trimmedLine.includes("writeFileSync")) {
					issues.push({
						type: "performance",
						severity: "medium",
						message: "Synchronous file operation detected. Consider using async alternatives.",
						file: filePath,
						line: lineNumber,
						suggestion: "Use readFile/writeFile with promises or async/await",
						ruleId: "sync-file-ops",
					})
				}

				// 检查低效的循环
				if (trimmedLine.includes("for") && trimmedLine.includes("length") && !trimmedLine.includes("const")) {
					issues.push({
						type: "performance",
						severity: "low",
						message: "Consider caching array length in loops for better performance.",
						file: filePath,
						line: lineNumber,
						suggestion: "Store array.length in a variable before the loop",
						ruleId: "inefficient-loop",
					})
				}

				// 检查频繁的DOM查询
				if (
					(trimmedLine.includes("getElementById") || trimmedLine.includes("querySelector")) &&
					(lines[index - 1]?.includes("getElementById") || lines[index + 1]?.includes("getElementById"))
				) {
					issues.push({
						type: "performance",
						severity: "medium",
						message: "Frequent DOM queries detected. Consider caching DOM elements.",
						file: filePath,
						line: lineNumber,
						suggestion: "Cache DOM elements in variables to avoid repeated queries",
						ruleId: "frequent-dom-queries",
					})
				}
			}
		})

		return issues
	}

	/**
	 * 代码风格检查
	 */
	private checkCodeStyle(content: string, filePath: string, fileExtension: string): CodeIssue[] {
		const issues: CodeIssue[] = []
		const lines = content.split("\n")

		lines.forEach((line, index) => {
			const lineNumber = index + 1

			// 检查混合缩进
			if (line.includes("\t") && line.includes("  ")) {
				issues.push({
					type: "style",
					severity: "low",
					message: "Mixed indentation detected (tabs and spaces).",
					file: filePath,
					line: lineNumber,
					suggestion: "Use consistent indentation (either tabs or spaces)",
					ruleId: "mixed-indentation",
				})
			}

			// 检查行尾空格
			if (line.endsWith(" ") || line.endsWith("\t")) {
				issues.push({
					type: "style",
					severity: "low",
					message: "Trailing whitespace detected.",
					file: filePath,
					line: lineNumber,
					suggestion: "Remove trailing whitespace",
					ruleId: "trailing-whitespace",
				})
			}
		})

		return issues
	}

	/**
	 * 计算代码指标
	 */
	private calculateMetrics(content: string, fileExtension: string) {
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
		const summary = {
			totalIssues: issues.length,
			criticalIssues: issues.filter((i) => i.severity === "critical").length,
			highIssues: issues.filter((i) => i.severity === "high").length,
			mediumIssues: issues.filter((i) => i.severity === "medium").length,
			lowIssues: issues.filter((i) => i.severity === "low").length,
		}

		return summary
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
}
