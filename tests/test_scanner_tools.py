import unittest

from supplyguard.scanner_tools import executable_suffixes


class ScannerToolDiscoveryTests(unittest.TestCase):
    def test_windows_prefers_native_executable_suffixes(self):
        self.assertEqual(executable_suffixes("nt"), (".exe", ".cmd", ".bat", ""))

    def test_posix_prefers_extensionless_executable(self):
        self.assertEqual(executable_suffixes("posix"), ("", ".exe", ".cmd", ".bat"))


if __name__ == "__main__":
    unittest.main()
