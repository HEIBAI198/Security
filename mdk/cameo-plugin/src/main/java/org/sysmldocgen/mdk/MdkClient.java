package org.sysmldocgen.mdk;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public final class MdkClient {
    private final String serverUrl;
    private final String username;
    private final HttpClient httpClient;

    public MdkClient(String serverUrl) {
        this.serverUrl = serverUrl.replaceAll("/+$", "");
        this.username = System.getProperty("sysml.docgen.user", "engineer");
        this.httpClient = HttpClient.newHttpClient();
    }

    public String pushModel(String project, String branch, String xmi, String username)
            throws IOException, InterruptedException {
        String payload = "{"
                + "\"project\":\"" + escape(project) + "\","
                + "\"branch\":\"" + escape(branch) + "\","
                + "\"username\":\"" + escape(username) + "\","
                + "\"commit\":true,"
                + "\"model\":{\"format\":\"xmi\",\"xmi\":\"" + escape(xmi) + "\"}"
                + "}";
        return post("/api/mdk/push", payload, "author");
    }

    public String pullModel(String project, String branch, String format)
            throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(serverUrl + "/api/mdk/pull?project=" + project + "&branch=" + branch + "&format=" + format))
                .header("X-User", username)
                .header("X-Role", "author")
                .GET()
                .build();
        return httpClient.send(request, HttpResponse.BodyHandlers.ofString()).body();
    }

    public String generateDocument(String project, String branch, String docType)
            throws IOException, InterruptedException {
        String payload = "{"
                + "\"project\":\"" + escape(project) + "\","
                + "\"branch\":\"" + escape(branch) + "\","
                + "\"doc_type\":\"" + escape(docType) + "\""
                + "}";
        return post("/api/mdk/generate", payload, "author");
    }

    private String post(String path, String payload, String role) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(serverUrl + path))
                .header("Content-Type", "application/json")
                .header("X-User", username)
                .header("X-Role", role)
                .POST(HttpRequest.BodyPublishers.ofString(payload))
                .build();
        return httpClient.send(request, HttpResponse.BodyHandlers.ofString()).body();
    }

    private static String escape(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }
}
