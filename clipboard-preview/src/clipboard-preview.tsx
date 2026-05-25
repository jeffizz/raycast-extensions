import { useEffect, useState } from "react";
import { Detail, Clipboard, environment } from "@raycast/api";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

export default function Command() {
  const [markdown, setMarkdown] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function processClipboard() {
      try {
        const platform = os.platform();
        const tempImagePath = path.join(environment.supportPath, "clipboard_raw.png");
        let hasRawImage = false;

        // ==========================================
        try {
          if (platform === "darwin") {
            const type = execSync(`osascript -e 'get (clipboard info)'`, { encoding: "utf8" });
            if (type.includes("PNGf")) {
              const appleScript = `
                try
                  set tempFile to POSIX file "${tempImagePath}"
                  open for access tempFile with write permission
                  set eof of tempFile to 0
                  write (the clipboard as «class PNGf») to tempFile
                  close access tempFile
                  return "SUCCESS"
                on error
                  try
                    close access tempFile
                  end try
                  return "FAIL"
                end try
              `;
              const res = execSync(`osascript -e '${appleScript}'`, { encoding: "utf8" }).trim();
              if (res === "SUCCESS" && fs.existsSync(tempImagePath)) hasRawImage = true;
            }

          } else if (platform === "win32") {
            const safePath = tempImagePath.replace(/\\/g, '\\\\');
            const psScript = `
              Add-Type -AssemblyName System.Windows.Forms;
              if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
                $img = [System.Windows.Forms.Clipboard]::GetImage();
                $img.Save('${safePath}', [System.Drawing.Imaging.ImageFormat]::Png);
                Write-Output 'SUCCESS';
              } else {
                Write-Output 'FAIL';
              }
            `;
            const res = execSync(`powershell.exe -NoProfile -NonInteractive -Command "${psScript.replace(/\n/g, ' ')}"`, {
              encoding: "utf8"
            }).trim();

            if (res === "SUCCESS" && fs.existsSync(tempImagePath)) hasRawImage = true;
          }
        } catch (e) {
        }

        // ==========================================
        if (hasRawImage) {
          const fileUriPath = platform === "win32" ? "/" + tempImagePath.replace(/\\/g, '/') : tempImagePath;

          const encodedPath = encodeURI(`file://${fileUriPath}`);

          const timestamp = Date.now();

          setMarkdown(`![Raw Clipboard Image](${encodedPath}?t=${timestamp})`);
          setIsLoading(false);
          return;
        }

        // ==========================================
        const textContent = await Clipboard.readText();

        if (textContent && textContent.trim() !== "") {
          const text = textContent.trim();

          const base64UriRegex = /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
          const rawBase64Regex = /^[A-Za-z0-9+/]+={0,2}$/;

          if (base64UriRegex.test(text)) {
            setMarkdown(`![Base64 Image](${text})`);
          } else if (text.length > 100 && !text.includes(" ") && rawBase64Regex.test(text)) {
            setMarkdown(`![Base64 Image](data:image/png;base64,${text})`);
          } else {
            setMarkdown(text);
          }
        } else {
          setMarkdown("### 📭 剪贴板为空，或是不支持渲染的数据类型（如文件系统对象）。");
        }

      } catch (error) {
        setMarkdown(`### ❌ 剪贴板解析异常\n\n\`\`\`text\n${String(error)}\n\`\`\``);
      } finally {
        setIsLoading(false);
      }
    }

    processClipboard();
  }, []);

  return <Detail isLoading={isLoading} markdown={markdown} navigationTitle={`剪贴板查看助手 [${os.platform()}]`} />;
}
