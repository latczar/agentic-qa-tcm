# Fixtures, users, seeded ids and helpers

Import from `{{testModuleImport}}`.

{{fixturesCompact}}

# Page objects

{{pageObjects}}

# Calls you may use

{{allowedCalls}}

# One example test from the same feature

{{firstExample}}

# The manual test case to automate

Id: {{testCaseId}}
Title: {{title}}
Feature: {{feature}}

Preconditions:
{{preconditions}}

Steps:
{{steps}}

Test data:
{{testData}}

# Task

Write the Playwright test for {{testCaseId}} titled "{{title}}", tagged '@{{testCaseId}}', following the steps above and asserting each expected result. Reply with the ```ts block containing the whole file, then the ```json metadata block.
