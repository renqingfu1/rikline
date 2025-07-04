import { Controller } from "../../../shared/proto/third_party_code_review"
import { UpdateProviderConfigRequest, UpdateProviderConfigResponse } from "../../../shared/proto/third_party_code_review"

/**
 * Updates configuration for a third-party code review provider.
 */
export async function updateProviderConfig(
	controller: Controller,
	request: UpdateProviderConfigRequest,
): Promise<UpdateProviderConfigResponse> {
	// TODO: Implement provider config update logic
	return UpdateProviderConfigResponse.create({
		success: true,
	})
}
