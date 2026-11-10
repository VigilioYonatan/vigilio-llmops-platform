# BDD acceptance requires test API and isolated data; no faked successful sign-in.
Feature: Safe authentication
  Scenario: Anonymous user cannot list private organizations
    When I request GET "/api/v1/organizations" without credentials
    Then the API status should be 401
  Scenario: Anonymous user cannot read private traces
    When I request GET "/api/v1/traces?workspace_id=00000000-0000-0000-0000-000000000000" without credentials
    Then the API status should be 401
