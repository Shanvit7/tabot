import {
	type AssistantConnections,
	apiClient,
	parseAssistantConnections,
} from "@tabot/shared";

export interface RelayCredentials {
	installationId: string;
	token: string;
}

export const getAssistantConnections = async (
	httpBase: string,
	token: string,
): Promise<AssistantConnections> => {
	const body = await apiClient.get<unknown>(`${httpBase}/connection`, {
		headers: { Authorization: `Bearer ${token}` },
		signal: AbortSignal.timeout(5_000),
	});
	const connections = parseAssistantConnections(body);
	if (!connections) throw new Error("Invalid connection status response");
	return connections;
};

export const pingRelay = (
	httpBase: string,
	installationId: string,
	token: string,
): Promise<Response> =>
	apiClient.request(
		`${httpBase}/relay/${encodeURIComponent(installationId)}/ping`,
		{
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(5_000),
		},
	);

export const approveAuthorizationTransaction = async (
	httpBase: string,
	transactionId: string,
	token: string,
): Promise<void> => {
	await apiClient.post<void>(
		`${httpBase}/authorize/transactions/${encodeURIComponent(transactionId)}/approve`,
		undefined,
		{ headers: { Authorization: `Bearer ${token}` } },
	);
};

export const registerInstallation = (
	httpBase: string,
): Promise<RelayCredentials> =>
	apiClient.post<RelayCredentials>(`${httpBase}/installations`);
