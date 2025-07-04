import {
	Controller,
	GetAvailableProvidersRequest,
	GetAvailableProvidersResponse,
	ProviderConfigTemplate,
} from "../../../shared/proto/third_party_code_review"

/**
 * 定义可用的第三方代码审查提供商模板
 */
const PROVIDER_TEMPLATES: Record<string, ProviderConfigTemplate> = {
	sonarqube: {
		providerId: "sonarqube",
		name: "SonarQube",
		description: "全面的静态代码分析平台",
		supportedLanguages: ["javascript", "typescript", "java", "python", "csharp", "cpp", "go", "php", "swift", "kotlin"],
		supportedFeatures: ["SECURITY_SCAN", "QUALITY_ANALYSIS", "COMPLEXITY_ANALYSIS", "VULNERABILITY_SCAN", "DEPENDENCY_CHECK"],
		requiredConfig: ["endpoint", "apiKey"],
		optionalConfig: ["timeout", "retryAttempts", "customHeaders", "projectKey"],
		configExample: {
			apiKey: "your-sonarqube-token",
			endpoint: "https://sonarqube.example.com",
			timeout: 30000,
			retryAttempts: 3,
			customHeaders: {
				"X-Project-Key": "your-project-key",
			},
		},
		documentationUrl: "https://docs.sonarqube.org/latest/extend/web-api/",
	},

	codeclimate: {
		providerId: "codeclimate",
		name: "CodeClimate",
		description: "代码质量和可维护性自动化分析",
		supportedLanguages: ["javascript", "typescript", "ruby", "python", "php", "swift", "go", "scss", "coffeescript"],
		supportedFeatures: ["QUALITY_ANALYSIS", "COMPLEXITY_ANALYSIS", "STYLE_CHECK"],
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
}

/**
 * Gets all available third-party code review providers.
 */
export async function getAvailableProviders(
	controller: Controller,
	request: GetAvailableProvidersRequest,
): Promise<GetAvailableProvidersResponse> {
	return GetAvailableProvidersResponse.create({
		providers: Object.values(PROVIDER_TEMPLATES).map((template) => ProviderConfigTemplate.create(template)),
	})
}
