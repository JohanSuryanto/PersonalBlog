@echo off
rem Starts the API from the backend folder. PowerShell: .\run   cmd: run   (extra arguments go to dotnet run)
dotnet run --project "%~dp0src\Blog.Api" %*
