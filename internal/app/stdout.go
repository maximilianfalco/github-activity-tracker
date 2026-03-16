package app

import "os"

func stdoutWriter() *os.File {
	return os.Stdout
}
