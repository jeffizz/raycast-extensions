import { execSync } from "child_process";
import { useEffect, useState } from "react";
import { Detail } from "@raycast/api";

interface Arguments {
    file?: string;
}

const isObsidianRunning = (): boolean => {
    const platform = process.platform;
    try {
        if (platform === "darwin") {
            const res = execSync(`osascript -e 'application "Obsidian" is running'`, { encoding: "utf8" }).trim();
            return res === "true";
        } else if (platform === "win32") {
            execSync(`tasklist /FI "IMAGENAME eq Obsidian.exe" | find /I "Obsidian.exe"`, { stdio: "ignore" });
            return true;
        } else {
            execSync(`pgrep -x obsidian`, { stdio: "ignore" });
            return true;
        }
    } catch (error) {
        return false;
    }
};

export default function Command(props: { arguments: Arguments }) {
    const { file } = props.arguments;
    const [markdownOutput, setMarkdownOutput] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>("");
    const [displayTitle, setDisplayTitle] = useState<string>("Active File");

    useEffect(() => {
        async function inspectTarget() {
            try {
                setIsLoading(true);
                setError("");

                // ==========================================
                const env = { ...process.env };
                const delimiter = process.platform === "win32" ? ";" : ":";
                env.PATH = `${env.PATH || ""}${delimiter}/usr/local/bin${delimiter}/opt/homebrew/bin${delimiter}${process.env.HOME}/.local/bin`;

                const CMD = "obsidian";

                if (!isObsidianRunning()) {
                    throw new Error("【前置校验失败】\n\n检测到 Obsidian 客户端未在运行！\n请先启动 Obsidian。");
                }

                // ==========================================
                let cliParam = "";

                if (file && file.trim() !== "") {
                    const hasSeparator = file.includes("/") || file.includes("\\");
                    cliParam = hasSeparator ? `path="${file}"` : `file="${file}"`;
                    setDisplayTitle(file);
                }

                // ==========================================
                let fileMetaOutput = "";
                try {
                    const metaCmd = `"${CMD}" file ${cliParam}`.trim();
                    fileMetaOutput = execSync(metaCmd, {
                        encoding: "utf8",
                        env: { ...process.env }
                    }).trim();
                } catch (cmdErr: any) {
                    throw new Error(`无法探测文件信息。CLI执行失败。\n参数状态: [${cliParam || "空参数 (读取当前焦点文件)"}]\n\n报错: ${cmdErr.stderr?.toString() || cmdErr.message}`);
                }

                // ==========================================
                const extMatch = fileMetaOutput.match(/^extension\s+(.+)$/im);

                if (!extMatch || !extMatch[1]) {
                    throw new Error(`无法从 CLI 输出中解析出扩展名。\n参数状态: [${cliParam || "空参数"}]\n\n【CLI 原始输出】:\n${fileMetaOutput}`);
                }

                const extension = extMatch[1].trim().toLowerCase();

                if (extension !== "md") {
                    throw new Error(`【类型拦截】目标文件为 ".${extension}" 格式。当前管道仅支持读取 Markdown (.md) 文件。`);
                }

                const nameMatch = fileMetaOutput.match(/^name\s+(.+)$/im);
                if (nameMatch && nameMatch[1]) {
                    setDisplayTitle(nameMatch[1].trim());
                }

                // ==========================================
                const readCmd = `"${CMD}" read ${cliParam}`.trim();
                const textContent = execSync(readCmd, {
                    encoding: "utf8",
                    env: { ...process.env }
                });

                if (!textContent || textContent.trim() === "") {
                    throw new Error(`文件读取成功，但内容为空。`);
                }

                setMarkdownOutput(textContent);

            } catch (err: any) {
                let errorMessage = err.message || "未知底层执行冲突";
                if (err.stderr && err.stderr.toString().trim() !== "") {
                    errorMessage += `\n\n【底层进程报错详情】:\n${err.stderr.toString()}`;
                }
                setError(errorMessage);
            } finally {
                setIsLoading(false);
            }
        }

        inspectTarget();
    }, [file]);

    if (error) {
        return (
            <Detail
                markdown={`### ❌ 链路拦截或执行失败\n\n\`\`\`text\n${error}\n\`\`\``}
                navigationTitle="执行拦截"
            />
        );
    }

    if (isLoading) return <Detail isLoading={true} />;

    return (
        <Detail
            markdown={markdownOutput}
            navigationTitle={`Obsidian -> ${displayTitle}`}
        />
    );
}
