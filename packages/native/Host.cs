// Optional C# host for the native Windows DLL. Target x64, not AnyCPU.
// Copy this program beside the complete native package; install WebView2.
using System;
using System.Runtime.InteropServices;

internal static class Host
{
    [DllImport("OpenCalcStudio.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern uint ocs_abi_version();
    [DllImport("OpenCalcStudio.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int ocs_run();
    [DllImport("OpenCalcStudio.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern IntPtr ocs_last_error();

    [STAThread]
    private static int Main()
    {
        if (ocs_abi_version() != 1) throw new InvalidOperationException("Expected ABI 1.");
        // This owns the UI loop. Do not call Application.Run before it.
        int code = ocs_run();
        if (code < 0) Console.Error.WriteLine(Marshal.PtrToStringUTF8(ocs_last_error()));
        // The runtime keeps the DLL loaded until this host process exits.
        return code < 0 ? 1 : code;
    }
}
