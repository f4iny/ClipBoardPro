using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

class TrimMemory {
    [DllImport("psapi.dll", SetLastError = true)]
    static extern bool EmptyWorkingSet(IntPtr hProcess);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenProcess(uint processAccess, bool bInheritHandle, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr hObject);

    const uint PROCESS_SET_QUOTA = 0x0100;
    const uint PROCESS_QUERY_INFORMATION = 0x0400;

    static void Main(string[] args) {
        try {
            if (args != null && args.Length > 0) {
                foreach (string arg in args) {
                    int pid;
                    if (int.TryParse(arg, out pid)) {
                        IntPtr h = OpenProcess(PROCESS_SET_QUOTA | PROCESS_QUERY_INFORMATION, false, pid);
                        if (h != IntPtr.Zero) {
                            try {
                                EmptyWorkingSet(h);
                            } finally {
                                CloseHandle(h);
                            }
                        }
                    }
                }
            } else {
                Process[] procs = Process.GetProcessesByName("ClipBoardPro");
                foreach (Process p in procs) {
                    try {
                        EmptyWorkingSet(p.Handle);
                    } catch {
                    } finally {
                        p.Dispose();
                    }
                }
            }
        } catch {
        }
    }
}
