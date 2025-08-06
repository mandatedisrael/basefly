declare module "airport-iata-codes" {
  function airportData(code: string): Array<{
    name: string;
    city: string;
    country: string;
    iata: string;
  }>;
  export = airportData;
} 