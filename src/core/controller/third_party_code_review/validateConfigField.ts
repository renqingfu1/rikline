import { Controller } from "../../../shared/proto/third_party_code_review"
import { ValidateConfigFieldRequest, ValidateConfigFieldResponse } from "../../../shared/proto/third_party_code_review"

/**
 * 验证配置字段的规则
 */
const CONFIG_VALIDATION_RULES: Record<string, Record<string, (value: string) => string | null>> = {
	sonarqube: {
		endpoint: (value: string) => {
			try {
				new URL(value)
				return null
			} catch {
				return "请输入有效的URL地址"
			}
		},
		apiKey: (value: string) => {
			if (!value || value.length < 10) {
				return "API密钥长度不能小于10个字符"
			}
			return null
		},
		timeout: (value: string) => {
			const timeout = parseInt(value)
			if (isNaN(timeout) || timeout < 1000 || timeout > 300000) {
				return "超时时间必须在1000-300000毫秒之间"
			}
			return null
		},
		retryAttempts: (value: string) => {
			const attempts = parseInt(value)
			if (isNaN(attempts) || attempts < 0 || attempts > 10) {
				return "重试次数必须在0-10之间"
			}
			return null
		},
		projectKey: (value: string) => {
			if (!value) {
				return "项目标识符不能为空"
			}
			return null
		},
	},

	codeclimate: {
		apiKey: (value: string) => {
			if (!value || value.length < 10) {
				return "API密钥长度不能小于10个字符"
			}
			return null
		},
		timeout: (value: string) => {
			const timeout = parseInt(value)
			if (isNaN(timeout) || timeout < 1000 || timeout > 300000) {
				return "超时时间必须在1000-300000毫秒之间"
			}
			return null
		},
		retryAttempts: (value: string) => {
			const attempts = parseInt(value)
			if (isNaN(attempts) || attempts < 0 || attempts > 10) {
				return "重试次数必须在0-10之间"
			}
			return null
		},
		repoId: (value: string) => {
			if (!value) {
				return "仓库ID不能为空"
			}
			return null
		},
	},
}

/**
 * Validates a configuration field for a third-party code review provider.
 */
export async function validateConfigField(
	controller: Controller,
	request: ValidateConfigFieldRequest,
): Promise<ValidateConfigFieldResponse> {
	const { providerId, fieldName, fieldValue } = request

	// 获取提供商的验证规则
	const providerRules = CONFIG_VALIDATION_RULES[providerId]
	if (!providerRules) {
		return ValidateConfigFieldResponse.create({
			isValid: false,
			errorMessage: "未知的提供商",
		})
	}

	// 获取字段的验证规则
	const fieldValidator = providerRules[fieldName]
	if (!fieldValidator) {
		// 如果没有特定的验证规则，则认为是有效的
		return ValidateConfigFieldResponse.create({
			isValid: true,
		})
	}

	// 执行验证
	const errorMessage = fieldValidator(fieldValue)

	return ValidateConfigFieldResponse.create({
		isValid: !errorMessage,
		errorMessage: errorMessage || undefined,
	})
}
