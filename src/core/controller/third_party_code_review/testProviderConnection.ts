import { Controller } from "../../../shared/proto/third_party_code_review"
import {
	TestProviderConnectionRequest,
	TestProviderConnectionResponse,
	ProviderHealthStatus,
	GetConfiguredProvidersRequest,
} from "../../../shared/proto/third_party_code_review"
import { getConfiguredProviders } from "./getConfiguredProviders"

/**
 * 测试提供商连接的具体实现
 */
async function testSonarQubeConnection(config: any): Promise<ProviderHealthStatus> {
	const startTime = Date.now()
	try {
		if (!config.endpoint || !config.apiKey) {
			throw new Error("缺少必需的配置：endpoint 或 apiKey")
		}

		const response = await fetch(`${config.endpoint}/api/system/status`, {
			headers: {
				Authorization: `Bearer ${config.apiKey}`,
				...config.customHeaders,
			},
			signal: AbortSignal.timeout(config.timeout || 30000),
		})

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`)
		}

		return ProviderHealthStatus.create({
			isHealthy: true,
			responseTime: Date.now() - startTime,
			lastChecked: new Date().toISOString(),
		})
	} catch (error) {
		return ProviderHealthStatus.create({
			isHealthy: false,
			responseTime: Date.now() - startTime,
			lastChecked: new Date().toISOString(),
			errorMessage: error instanceof Error ? error.message : String(error),
		})
	}
}

async function testCodeClimateConnection(config: any): Promise<ProviderHealthStatus> {
	const startTime = Date.now()
	try {
		if (!config.apiKey) {
			throw new Error("缺少必需的配置：apiKey")
		}

		const response = await fetch("https://api.codeclimate.com/v1/user", {
			headers: {
				Authorization: `Token ${config.apiKey}`,
				Accept: "application/vnd.api+json",
				...config.customHeaders,
			},
			signal: AbortSignal.timeout(config.timeout || 30000),
		})

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`)
		}

		return ProviderHealthStatus.create({
			isHealthy: true,
			responseTime: Date.now() - startTime,
			lastChecked: new Date().toISOString(),
		})
	} catch (error) {
		return ProviderHealthStatus.create({
			isHealthy: false,
			responseTime: Date.now() - startTime,
			lastChecked: new Date().toISOString(),
			errorMessage: error instanceof Error ? error.message : String(error),
		})
	}
}

/**
 * Tests connection to a third-party code review provider.
 */
export async function testProviderConnection(
	controller: Controller,
	request: TestProviderConnectionRequest,
): Promise<TestProviderConnectionResponse> {
	try {
		// 获取提供商配置
		const configResponse = await getConfiguredProviders(controller, GetConfiguredProvidersRequest.create({}))
		const providerConfig = configResponse.providers[request.providerId]

		if (!providerConfig) {
			return TestProviderConnectionResponse.create({
				status: ProviderHealthStatus.create({
					isHealthy: false,
					responseTime: 0,
					lastChecked: new Date().toISOString(),
					errorMessage: "提供商未配置",
				}),
			})
		}

		// 根据提供商类型执行不同的测试
		let status: ProviderHealthStatus
		switch (request.providerId) {
			case "sonarqube":
				status = await testSonarQubeConnection(providerConfig)
				break
			case "codeclimate":
				status = await testCodeClimateConnection(providerConfig)
				break
			default:
				status = ProviderHealthStatus.create({
					isHealthy: false,
					responseTime: 0,
					lastChecked: new Date().toISOString(),
					errorMessage: "不支持的提供商类型",
				})
		}

		return TestProviderConnectionResponse.create({
			status,
		})
	} catch (error) {
		return TestProviderConnectionResponse.create({
			status: ProviderHealthStatus.create({
				isHealthy: false,
				responseTime: 0,
				lastChecked: new Date().toISOString(),
				errorMessage: error instanceof Error ? error.message : String(error),
			}),
		})
	}
}
