﻿using Humanizer;
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace PageGenerator
{
    public static class Helpers
    {
        static int WordIndex = 0;
        static int CurrentIndent = 0;

        public static void AddPageStart(this StringBuilder sb)
        {
            sb.AppendLine(@"<!DOCTYPE html>");
            sb.AppendLine(@"<html>");
            sb.AppendLine(@"<head>");
            sb.AppendLine(@"<link rel=""stylesheet"" href=""style.css"">");
            sb.AppendLine(@"<link rel=""stylesheet"" href=""..\..\PageMenu\PageMenu\formmenu.css"">");
            sb.AppendLine(@"</head>");
            sb.AppendLine(@"<body>");
            sb.AppendLine(@"<div class=""inner"">");
        }

        public static void AddPageEnd(this StringBuilder sb)
        {
            sb.AppendLine(@"</div>");
            sb.AppendLine(@"<script src=""..\..\PageMenu\PageMenu\formmenu.js""></script>");
            sb.AppendLine(@"<script src=""..\..\PageMenu\PageMenu\formmenu.config.js""></script>");
            sb.AppendLine(@"</body>");
            sb.AppendLine(@"</html>");
        }

        public static void AddHeading(this StringBuilder sb, int level)
        {
            // Indent of this heading will be that produced by the parent heading
            CurrentIndent = (level - 1) * 4;

            sb.AppendLine(@"");
            string caption = GetRandomWord().Humanize(LetterCasing.Title);
            string line = $"<H{level}>{caption}</H{level}>";
            sb.AddIndentedLine(line);

            CurrentIndent = level * 4;
        }

        public static void AddInput(this StringBuilder sb, bool required, bool isEmail)
        {
            sb.AppendLine(@"");
            string caption = GetRandomWord().Humanize(LetterCasing.Title);
            string id = caption.ToLower().Replace(" ", "");

            sb.AddIndentedLine("<p>");

            string asteriskString = required ? " *" : "";
            string emailString = isEmail ? " Email" : "";
            sb.Append(new String(' ', CurrentIndent + 4));
            sb.AppendLine($"<label for=\"{id}\">{caption}{emailString}{asteriskString}</label>");

            sb.Append(new String(' ', CurrentIndent + 4));
            string requiredString = required ? " required" : "";
            string typeString = isEmail ? "email" : "text";
            sb.AppendLine($"<input type=\"{typeString}\" id=\"{id}\"{requiredString}>");

            sb.AddIndentedLine("</p>");
        }

        public static void AddLoremIpsum(this StringBuilder sb, int numParagraphs)
        {
            LoremIpsum(sb, 5, 40, 1, 5, numParagraphs);
        }

        public static void AddIndentedLine(this StringBuilder sb, string line)
        {
            string indentedLine = (new String(' ', CurrentIndent)) + line;
            sb.AppendLine(indentedLine);
        }

        public static void WriteToFile(this StringBuilder sb, string filePath)
        {
            string text = sb.ToString();
            File.WriteAllText(filePath, text);
        }

        public static string GetRandomWord()
        {
            int nbrWords = EnglishWords.LongList.Count;
            string word = EnglishWords.LongList[(WordIndex++) % nbrWords];
            return word;
        }

        public static void LoremIpsum(StringBuilder sb, int minWords, int maxWords,
                                            int minSentences, int maxSentences,
                                            int numParagraphs)
        {

            var words = new[]{"lorem", "ipsum", "dolor", "sit", "amet", "consectetuer",
        "adipiscing", "elit", "sed", "diam", "nonummy", "nibh", "euismod",
        "tincidunt", "ut", "laoreet", "dolore", "magna", "aliquam", "erat"};

            var rand = new Random();
            int numSentences = rand.Next(maxSentences - minSentences)
                + minSentences + 1;
            int numWords = rand.Next(maxWords - minWords) + minWords + 1;

            for (int p = 0; p < numParagraphs; p++)
            {
                sb.AddIndentedLine("<p>");
                for (int s = 0; s < numSentences; s++)
                {
                    sb.Append(new String(' ', CurrentIndent + 4));
                    for (int w = 0; w < numWords; w++)
                    {
                        if (w > 0) { sb.Append(" "); }
                        sb.Append(words[rand.Next(words.Length)]);
                    }
                    sb.AppendLine(". ");
                }
                sb.AddIndentedLine("</p>");
            }
        }
    }
}
