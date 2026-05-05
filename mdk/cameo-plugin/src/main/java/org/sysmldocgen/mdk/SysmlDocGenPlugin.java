package org.sysmldocgen.mdk;

public final class SysmlDocGenPlugin {
    private final MdkClient client;

    public SysmlDocGenPlugin() {
        String server = System.getProperty("sysml.docgen.server", "http://127.0.0.1:8000");
        this.client = new MdkClient(server);
    }

    public void init() {
        System.out.println("SysML DocGen MDK plugin initialized.");
    }

    public boolean close() {
        return true;
    }

    public boolean isSupported() {
        return true;
    }

    public String pushCurrentProjectXmi(String project, String branch, String xmi) throws Exception {
        return client.pushModel(project, branch, xmi, System.getProperty("user.name", "cameo-mdk"));
    }

    public String pullModel(String project, String branch) throws Exception {
        return client.pullModel(project, branch, "xmi");
    }

    public String generatePdf(String project, String branch) throws Exception {
        return client.generateDocument(project, branch, "pdf");
    }
}
