import {
	Controller,
	GetThirdPartyReviewGlobalConfigRequest,
	GetThirdPartyReviewGlobalConfigResponse,
	GlobalCodeReviewConfig,
} from "../../../shared/proto/third_party_code_review"
import * as vscode from "vscode"

/**
 * 获取第三方代码审查的全局配置
 */
export async function getThirdPartyReviewGlobalConfig(
	controller: Controller,
	request: GetThirdPartyReviewGlobalConfigRequest,
): Promise<GetThirdPartyReviewGlobalConfigResponse> {
	try {
		// 从 VSCode 配置中读取第三方代码审查配置
		const config = vscode.workspace.getConfiguration("codeReview.thirdParty")

		// 获取配置的提供商和启用状态
		const configuredProviders = config.get<string>("configuredProviders", "{}")
		const enabledProviders = config.get<string[]>("enabledProviders", [])

		return GetThirdPartyReviewGlobalConfigResponse.create({
			success: true,
			config: GlobalCodeReviewConfig.create({
				configuredProviders,
				enabledProviders,
			}),
		})
	} catch (error) {
		console.error("Failed to get third party review global config:", error)
		return GetThirdPartyReviewGlobalConfigResponse.create({
			success: false,
			errorMessage: error instanceof Error ? error.message : "获取配置失败",
		})
	}
}
