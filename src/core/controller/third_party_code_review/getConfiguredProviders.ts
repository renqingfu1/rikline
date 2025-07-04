import {
	Controller,
	GetConfiguredProvidersRequest,
	GetConfiguredProvidersResponse,
} from "../../../shared/proto/third_party_code_review"

/**
 * Gets all configured third-party code review providers.
 */
export async function getConfiguredProviders(
	controller: Controller,
	request: GetConfiguredProvidersRequest,
): Promise<GetConfiguredProvidersResponse> {
	// TODO: Implement configured providers retrieval logic
	return GetConfiguredProvidersResponse.create({
		providers: {},
		enabledProviders: [],
	})
}

export class GetConfiguredProvidersController implements Controller {
	id = "getConfiguredProviders"
	async handle(request: GetConfiguredProvidersRequest): Promise<GetConfiguredProvidersResponse> {
		return GetConfiguredProvidersResponse.create({
			providers: {},
			enabledProviders: [],
		})
	}
}
