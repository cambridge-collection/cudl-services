<xsl:stylesheet version="2.0"
   xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
   xmlns:json="http://cudl.lib.cam.ac.uk/ns/json">

   <xsl:output method="xml"></xsl:output>

   <xsl:template match="/Runtime">
      <xsl:message terminate="yes">
         <xsl:text>XTF responded with an error: </xsl:text>
         <xsl:value-of select="normalize-space(message)"/>
      </xsl:message>
   </xsl:template>

   <xsl:template match="/crossQueryResult">
      <json:object>
         <json:number key="queryTime">
            <xsl:value-of select="@queryTime"/>
         </json:number>

         <json:number key="totalDocs">
            <xsl:value-of select="@totalDocs"/>
         </json:number>

         <json:number key="startDoc">
            <xsl:value-of select="@startDoc"/>
         </json:number>

         <json:number key="endDoc">
            <xsl:value-of select="@endDoc"/>
         </json:number>

         <json:array key="hits">
            <xsl:apply-templates select="docHit"/>
         </json:array>
      </json:object>
   </xsl:template>

   <xsl:template match="docHit">
      <json:object>
         <json:number key="score">
            <xsl:value-of select="@score"/>
         </json:number>

         <json:string key="title">
            <xsl:value-of select="meta/title"/>
         </json:string>

         <json:string key="ID">
            <xsl:value-of select="meta/fileID"/>
         </json:string>

         <json:string key="descriptiveMetadataID">
            <xsl:value-of select="meta/fileID"/>
         </json:string>
      </json:object>
   </xsl:template>

</xsl:stylesheet>
